#!/usr/bin/env node
"use strict";

const { hashTaskOutput, hashLayer, hashInputs } = require("./hash-spec");

/**
 * Compute layer hashes from compile output and task output map.
 * @param {object} compileResult - output of compileDagFromObject
 * @param {object} tasks - DAG tasks definition
 * @param {Record<string, object>} taskOutputs - taskId -> raw output for hashing
 * @returns {{ layerHashes: string[], taskHashes: Record<string, string> }}
 */
function computeLayerHashes(compileResult, tasks, taskOutputs) {
  const taskHashes = {};
  const layerHashes = [];

  for (const layer of compileResult.layerGroups) {
    const sorted = [...layer].sort();
    const hashesInLayer = [];

    for (const taskId of sorted) {
      const taskDef = tasks[taskId];
      let output = taskOutputs[taskId];

      if (taskDef.type === "compute") {
        const depHashes = (taskDef.depends_on || [])
          .slice()
          .sort()
          .map((dep) => {
            if (!taskHashes[dep]) {
              throw new Error(`Missing dependency hash for compute task "${taskId}": "${dep}"`);
            }
            return taskHashes[dep];
          });
        output = { inputsHash: hashInputs(depHashes) };
      }

      if (!output) {
        throw new Error(`Missing task output for "${taskId}"`);
      }

      const th = hashTaskOutput(taskId, taskDef, output);
      taskHashes[taskId] = th;
      hashesInLayer.push(th);
    }

    const layerIndex = compileResult.layerGroups.indexOf(layer);
    layerHashes.push(hashLayer(layerIndex, hashesInLayer));
  }

  return { layerHashes, taskHashes };
}

function main() {
  const fs = require("fs");
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  const result = computeLayerHashes(input.compile, input.tasks, input.taskOutputs);
  console.log(JSON.stringify(result));
}

if (require.main === module) {
  main();
}

module.exports = { computeLayerHashes };
