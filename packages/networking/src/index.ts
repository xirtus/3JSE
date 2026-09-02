// @3jse/networking — docs/NETWORKING.md replication core + authority model + RPC + prediction.
// State replication with server authority (not deterministic lockstep). WebSocket is the
// default transport in a shipped game; this package depends only on the Transport interface.

export {
  markReplicated,
  isReplicated,
  replicationRule,
  replicatedComponentTypes,
  hasAuthority,
  SnapshotWriter,
  applySnapshot,
  type ReplicationRule,
  type AuthorityData,
  type NetIdData,
  type Side,
  type Snapshot,
  type EntitySnapshot,
} from "./replication.js";
export { LoopbackPair, type Transport } from "./transport.js";
export { WebSocketTransport, type WebSocketLike, type WebSocketTransportOptions } from "./websocket.js";
export { PredictedController, type PredictionConfig } from "./prediction.js";
export { defineRpc, RpcHub, type RpcDef, type RpcEnvelope, type RpcDirection, type RpcSender } from "./rpc.js";
export {
  PriorityAccumulator,
  type RepEntity,
  type RepConnection,
} from "./priority.js";
export { HistoryBuffer, type Snapshot3D } from "./lagcomp.js";

// Registers Authority / NetId against @3jse/runtime's ComponentRegistry as a side effect.
import "./replication.js";
