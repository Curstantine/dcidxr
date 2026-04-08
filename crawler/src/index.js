#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const MEGA_LINK_REGEX = /https?:\/\/(?:www\.)?mega\.(?:nz|co\.nz)\/[^\s)>]+/gi;
const CIRCLE_REGEX = /^\s*\*\*(.+?)\*\*(?:\s+.*)?$/;

function printUsage() {
  console.error("Usage: node src/index.js strip [inputPath] [outputPath]");
}

function normalizeCircleName(rawName) {
  return rawName.trim();
}

function collectGroups(messages) {
  const groups = new Map();

  for (const message of messages) {
    const content = typeof message?.content === "string" ? message.content : "";
    if (!content) {
      continue;
    }

    let currentCircle = null;
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const circleMatch = line.match(CIRCLE_REGEX);
      if (circleMatch) {
        const normalized = normalizeCircleName(circleMatch[1]);
        currentCircle = normalized.length > 0 && normalized !== " " ? normalized : null;
      }

      const links = [...line.matchAll(MEGA_LINK_REGEX)].map((match) => match[0]);
      if (!currentCircle || links.length === 0) {
        continue;
      }

      if (!groups.has(currentCircle)) {
        groups.set(currentCircle, new Set());
      }

      const circleLinks = groups.get(currentCircle);
      for (const link of links) {
        circleLinks.add(link);
      }
    }
  }

  return [...groups.entries()].map(([circle, linkSet]) => ({
    circle,
    links: [...linkSet],
  }));
}

function runStrip(inputArg, outputArg) {
  const inputPath = path.resolve(process.cwd(), inputArg ?? "input.messages.json");
  const outputPath = path.resolve(process.cwd(), outputArg ?? "output.messages.json");

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const inputRaw = fs.readFileSync(inputPath, "utf8");
  const inputJson = JSON.parse(inputRaw);

  if (!Array.isArray(inputJson?.messages)) {
    throw new Error("Invalid input JSON: expected top-level 'messages' array.");
  }

  const groups = collectGroups(inputJson.messages);

  const outputJson = {
    groups,
  };

  fs.writeFileSync(outputPath, JSON.stringify(outputJson, null, 2));

  const totalLinks = groups.reduce((sum, group) => sum + group.links.length, 0);
  console.log(`Wrote ${groups.length} circles and ${totalLinks} MEGA links to ${outputPath}`);
}

function main() {
  const [command, inputArg, outputArg] = process.argv.slice(2);

  if (command !== "strip") {
    printUsage();
    process.exitCode = 1;
    return;
  }

  runStrip(inputArg, outputArg);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}
