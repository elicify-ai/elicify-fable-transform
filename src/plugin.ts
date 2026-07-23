/**
 * OpenCode plugin entry — ONLY plugin exports.
 * OpenCode 1.18 validates every module export value; shipping helpers from the
 * package root causes "Plugin export is not a function".
 */
import { ElicifyVertexPlugin } from "./index.js"

export const server = ElicifyVertexPlugin
export default ElicifyVertexPlugin
