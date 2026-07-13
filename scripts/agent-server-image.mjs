export function resolveAgentServerImage(config) {
  const { agentServer, agentServerVariant } = config.images;
  return `${agentServer}:${config.versions.agentServer}-${agentServerVariant}`;
}
