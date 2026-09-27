import { initializeApp, cert } from "firebase-admin/app"
import { getFirestore, FieldValue } from "firebase-admin/firestore"
import * as fs from "fs"
import * as path from "path"
import * as readline from "readline"

const args = process.argv.slice(2)
const envArg = args.find((a) => a.startsWith("--env="))
const isDryRun = !args.includes("--commit")

if (!envArg) {
  console.error(
    "\n  ERROR: You must specify --env=dev or --env=prod\n" +
    "\n  Examples:" +
    "\n    npx ts-node --project tsconfig.scripts.json scripts/migrate-rollno-to-regno.ts --env=prod" +
    "\n    npx ts-node --project tsconfig.scripts.json scripts/migrate-rollno-to-regno.ts --env=prod --commit\n"
  )
  process.exit(1)
}

const env = envArg.replace("--env=", "").toLowerCase()
if (env !== "dev" && env !== "prod") {
  console.error("  ERROR: --env must be dev or prod, got: " + env)
  process.exit(1)
}

const keyFileName = env === "prod" ? "serviceAccountKey.prod.json" : "serviceAccountKey.dev.json"
const keyPath = path.resolve(__dirname, keyFileName)

if (!fs.existsSync(keyPath)) {
  console.error(
    "\n  ERROR: Key not found at: " + keyPath +
    "\n  Generate from Firebase Console -> Project Settings -> Service Accounts\n"
  )
  process.exit(1)
}

const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"))
initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()
const projectId: string = serviceAccount.project_id

async function confirmTarget(): Promise<void> {
  const modeLabel = isDryRun ? "DRY-RUN  (no writes)" : "LIVE RUN  (WILL WRITE TO FIRESTORE)"
  console.log(
    "\n  +------------------------------------------------+" +
    "\n  |   Firestore Migration: rollNo -> regNo         |" +
    "\n  +------------------------------------------------+" +
    "\n  |  Environment : " + env.toUpperCase().padEnd(31) + "|" +
    "\n  |  Project ID  : " + projectId.padEnd(31) + "|" +
    "\n  |  Mode        : " + modeLabel.padEnd(31) + "|" +
    "\n  +------------------------------------------------+\n"
  )

  if (isDryRun) {
    console.log("  [DRY-RUN] No writes. Use --commit to apply.\n")
    return
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  await new Promise<void>((resolve, reject) => {
    rl.question("  Type the project ID to confirm: ", (answer) => {
      rl.close()
      if (answer.trim() === projectId) {
        console.log("  Confirmed. Proceeding...\n")
        resolve()
      } else {
        console.error("\n  Confirmation failed. Aborting.\n")
        reject(new Error("Aborted"))
      }
    })
  })
}

interface Result {
  totalScanned: number
  alreadyMigrated: number
  migrated: number
  errors: string[]
}

async function runMigration(): Promise<Result> {
  const result: Result = { totalScanned: 0, alreadyMigrated: 0, migrated: 0, errors: [] }

  console.log("  Fetching all user documents...")
  const snapshot = await db.collection("users").get()
  result.totalScanned = snapshot.size
  console.log("  Found " + result.totalScanned + " documents.\n")

  const toMigrate: { id: string; rollNo: string }[] = []
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data()
    if (!("rollNo" in data)) { result.alreadyMigrated++; continue }
    toMigrate.push({ id: docSnap.id, rollNo: data.rollNo })
  }

  if (toMigrate.length === 0) {
    console.log("  Nothing to migrate — no rollNo fields found.\n")
    return result
  }

  console.log("  Needs migration : " + toMigrate.length)
  console.log("  Already done    : " + result.alreadyMigrated + "\n")

  if (isDryRun) {
    console.log("  DRY-RUN PREVIEW (first 30):")
    console.log("  " + "-".repeat(55))
    for (const doc of toMigrate.slice(0, 30)) {
      console.log("  [" + doc.id + "]  rollNo: " + JSON.stringify(doc.rollNo))
    }
    if (toMigrate.length > 30) console.log("  ... and " + (toMigrate.length - 30) + " more")
    console.log("  " + "-".repeat(55) + "\n")
    result.migrated = toMigrate.length
    return result
  }

  const BATCH_SIZE = 400
  let processed = 0
  for (let i = 0; i < toMigrate.length; i += BATCH_SIZE) {
    const batch = db.batch()
    const chunk = toMigrate.slice(i, i + BATCH_SIZE)
    for (const doc of chunk) {
      batch.update(db.collection("users").doc(doc.id), {
        regNo: doc.rollNo,
        rollNo: FieldValue.delete(),
      })
    }
    try {
      await batch.commit()
      processed += chunk.length
      result.migrated += chunk.length
      console.log("  Batch " + (Math.floor(i / BATCH_SIZE) + 1) + ": " + chunk.length + " docs committed (" + processed + "/" + toMigrate.length + ")")
    } catch (err: any) {
      const msg = "Batch " + (Math.floor(i / BATCH_SIZE) + 1) + " failed: " + err.message
      result.errors.push(msg)
      console.error("  ERROR: " + msg)
    }
  }

  return result
}

async function main() {
  try {
    await confirmTarget()
    const result = await runMigration()
    console.log(
      "\n  +------------------------------------------------+" +
      "\n  |               Migration Summary                |" +
      "\n  +------------------------------------------------+" +
      "\n  |  Project    : " + projectId.padEnd(32) + "|" +
      "\n  |  Mode       : " + (isDryRun ? "DRY-RUN" : "LIVE").padEnd(32) + "|" +
      "\n  |  Scanned    : " + String(result.totalScanned).padEnd(32) + "|" +
      "\n  |  Skipped    : " + String(result.alreadyMigrated).padEnd(32) + "|" +
      "\n  |  " + (isDryRun ? "Would write" : "Migrated   ") + " : " + String(result.migrated).padEnd(32) + "|" +
      "\n  |  Errors     : " + String(result.errors.length).padEnd(32) + "|" +
      "\n  +------------------------------------------------+\n"
    )
    if (result.errors.length > 0) { result.errors.forEach((e) => console.error("  - " + e)); process.exit(1) }
    if (isDryRun) {
      console.log("  Dry-run done. Re-run with --commit to apply.\n")
    } else {
      console.log("  Done. Verify in Firebase Console.\n")
    }
  } catch { process.exit(1) }
}

main()
