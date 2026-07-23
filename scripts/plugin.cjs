/**
 * CJS entry for hosts that load plugins via require().
 * Export the plugin function as module.exports (not a namespace object).
 */
module.exports = async function ElicifyVertexPlugin(input, options) {
  const mod = await import("./index.js")
  return mod.ElicifyVertexPlugin(input, options)
}
module.exports.server = module.exports
module.exports.default = module.exports
