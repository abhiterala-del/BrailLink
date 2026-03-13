import "../shared/env";
import express from "express";
import { homedir } from "node:os";
import { execFile } from "child_process";
import cors from "cors";
import { getUnsupportedCharacters, layoutBraille, MAX_LINES } from "../shared/braille";

// Runs on a machine on the same network as the Raspberry Pi and forwards
// print jobs to it over SSH.
const port = Number(process.env.PRINT_PORT) || 3000;
const piHost = process.env.PI_HOST || "raspberrypi.local";
const piUser = process.env.PI_USER || "pi";
const piKey = (process.env.PI_SSH_KEY || "~/.ssh/id_rsa").replace(/^~\//, `${homedir()}/`);
const piTarget = `${piUser}@${piHost}`;
const sshTimeoutMs = 30_000;

const app = express();
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "http://localhost:5001" }));
app.use(express.json());

// The printer reads each cell's dots column by column, bottom to top.
function rearrangeBrailleCode(cell: string) {
  return cell[2] + cell[1] + cell[0] + cell[5] + cell[4] + cell[3];
}

function ssh(remoteCommand: string, input?: string) {
  return new Promise<string>((resolve, reject) => {
    const child = execFile(
      "ssh",
      ["-i", piKey, "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", piTarget, remoteCommand],
      { timeout: sshTimeoutMs },
      (error, stdout, stderr) => {
        // ssh writes harmless warnings to stderr, so only the exit code counts as failure
        if (error) return reject(Object.assign(error, { stderr }));
        resolve(stdout);
      },
    );
    child.stdin?.end(input ?? "");
  });
}

app.post("/print", async (req, res) => {
  const { text } = req.body ?? {};
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).send("No text received");
  }

  if (getUnsupportedCharacters(text).length) {
    return res.status(400).send("Text contains unsupported characters. Review the Braille preview warnings.");
  }

  const lines = layoutBraille(text);
  if (lines.length > MAX_LINES) {
    return res.status(400).send(`Text exceeds the maximum of ${MAX_LINES} lines`);
  }

  const binaryText = lines.map((line) => line.map(rearrangeBrailleCode).join(" ")).join("\n");

  try {
    const stdout = await ssh("bash ~/receive_text.sh", binaryText + "\n");
    console.log(`SSH stdout: ${stdout}`);
    res.send(`Success: ${stdout}`);
  } catch (error: any) {
    console.error(`Error sending message: ${error.message}\n${error.stderr ?? ""}`);
    res.status(500).send(`Error: ${error.message}`);
  }
});

app.post("/api/terminate-print", async (_req, res) => {
  try {
    await ssh("pkill -SIGTERM -f completetest.py");
    res.send(`Termination signal (SIGTERM) sent successfully to "completetest.py".`);
  } catch (error: any) {
    if (error.code === 1) {
      return res.send(`No process matching "completetest.py" found to terminate.`);
    }
    console.error(`Error executing pkill: ${error.message}\n${error.stderr ?? ""}`);
    res.status(500).send(`Error terminating process. Details: ${error.message}`);
  }
});

app.listen(port, () => {
  console.log(`Print server running at http://localhost:${port}, printing to ${piTarget}`);
});
