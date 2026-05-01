import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  BaseEdge,
  EdgeLabelRenderer,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Background,
  Controls,
  MiniMap,
  getBezierPath,
  ConnectionLineType,
  ConnectionMode,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { IoAdd, IoArrowRedo, IoArrowUndo, IoCreate, IoTrash } from 'react-icons/io5';
import toast from 'react-hot-toast';

import StartNode from './nodes/StartNode';
import MessageNode from './nodes/MessageNode';
import ConditionNode from './nodes/ConditionNode';
import DelayNode from './nodes/DelayNode';
import ApiNode from './nodes/ApiNode';
import EndNode from './nodes/EndNode';
import NodePalette from './NodePalette';
import PropertiesPanel from './PropertiesPanel';
import { defaultData, sanitizeFlowNodesForSave } from './flowBuilderDefaults';
import { autoTemplates, createTemplateCanvasState } from './flowTemplates';
import useConfirmDialog from '../../hooks/useConfirmDialog';

const nodeTypes = {
  startNode: StartNode,
  messageNode: MessageNode,
  conditionNode: ConditionNode,
  delayNode: DelayNode,
  apiNode: ApiNode,
  endNode: EndNode,
};

const defaultEdgeOptions = {
  type: 'visibleLink',
  animated: false,
  interactionWidth: 24,
  zIndex: 8,
  style: { strokeWidth: 1.8, stroke: '#64748b', strokeDasharray: '1 7', strokeLinecap: 'round' },
  pathOptions: { borderRadius: 18, offset: 24 },
};

const HISTORY_LIMIT = 60;
const SINGLE_PATH_NODE_TYPES = new Set(['startNode', 'messageNode', 'delayNode']);
const BRANCH_PATH_NODE_TYPES = new Set(['conditionNode', 'apiNode']);
const DEFAULT_NODE_SIZES = {
  startNode: { width: 220, height: 86 },
  messageNode: { width: 280, height: 190 },
  conditionNode: { width: 280, height: 150 },
  delayNode: { width: 180, height: 120 },
  apiNode: { width: 280, height: 140 },
  endNode: { width: 190, height: 90 },
};

let nodeId = 0;
const getId = () => `node_${Date.now()}_${++nodeId}`;

function cloneCanvasState(nodes, edges) {
  const clone = typeof structuredClone === 'function'
    ? structuredClone
    : (value) => JSON.parse(JSON.stringify(value));

  return {
    nodes: clone(nodes),
    edges: clone(edges),
  };
}

function areCanvasStatesEqual(left, right) {
  if (!left || !right) return false;
  return JSON.stringify(left) === JSON.stringify(right);
}

function getConnectionScope(sourceNode, sourceHandle = '') {
  if (!sourceNode) return null;
  if (SINGLE_PATH_NODE_TYPES.has(sourceNode.type)) {
    return { type: 'single', key: sourceNode.id };
  }
  if (BRANCH_PATH_NODE_TYPES.has(sourceNode.type)) {
    return { type: 'branch', key: `${sourceNode.id}:${sourceHandle || ''}` };
  }
  return null;
}

function sanitizeEdgesForRuntime(nodes = [], edges = []) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const exactEdgeKeys = new Set();
  const scopedEdgeIndexes = new Map();
  const sanitizedEdges = [];

  edges.forEach((edge) => {
    if (!edge?.source || !edge?.target || edge.source === edge.target) return;
    if (!nodeMap.has(edge.source) || !nodeMap.has(edge.target)) return;

    const exactKey = [
      edge.source,
      edge.sourceHandle || '',
      edge.target,
      edge.targetHandle || '',
    ].join('::');
    if (exactEdgeKeys.has(exactKey)) return;
    exactEdgeKeys.add(exactKey);

    const normalizedEdge = { ...defaultEdgeOptions, ...edge };
    const scope = getConnectionScope(nodeMap.get(edge.source), edge.sourceHandle);
    if (!scope) {
      sanitizedEdges.push(normalizedEdge);
      return;
    }

    const existingIndex = scopedEdgeIndexes.get(scope.key);
    if (existingIndex === undefined) {
      scopedEdgeIndexes.set(scope.key, sanitizedEdges.length);
      sanitizedEdges.push(normalizedEdge);
      return;
    }

    sanitizedEdges[existingIndex] = normalizedEdge;
  });

  return sanitizedEdges;
}

function getEdgeColor(edge = {}) {
  if (edge.selected) return '#0f766e';
  return '#64748b';
}

function getEdgeLabel(edge = {}) {
  if (edge.sourceHandle === 'yes') return 'Yes';
  if (edge.sourceHandle === 'no') return 'No';
  if (edge.sourceHandle === 'success') return 'Success';
  if (edge.sourceHandle === 'error') return 'Error';
  return 'Link';
}

function getNodeSize(node = {}) {
  const fallback = DEFAULT_NODE_SIZES[node.type] || { width: 240, height: 140 };
  return {
    width: node.measured?.width || node.width || fallback.width,
    height: node.measured?.height || node.height || fallback.height,
  };
}

function getSourceAnchor(node = {}, sourceHandle = '') {
  const { width, height } = getNodeSize(node);
  const sourceXRatio = ['yes', 'success'].includes(sourceHandle)
    ? 0.3
    : ['no', 'error'].includes(sourceHandle)
      ? 0.7
      : 0.5;

  return {
    x: (node.position?.x || 0) + width * sourceXRatio,
    y: (node.position?.y || 0) + height,
  };
}

function getTargetAnchor(node = {}) {
  const { width } = getNodeSize(node);
  return {
    x: (node.position?.x || 0) + width * 0.5,
    y: node.position?.y || 0,
  };
}

function toScreenPoint(point, viewport) {
  return {
    x: point.x * viewport.zoom + viewport.x,
    y: point.y * viewport.zoom + viewport.y,
  };
}

function buildOverlayPath(source, target) {
  const [path] = getBezierPath({
    sourceX: source.x,
    sourceY: source.y,
    sourcePosition: Position.Bottom,
    targetX: target.x,
    targetY: target.y,
    targetPosition: Position.Top,
    curvature: 0.35,
  });

  return path;
}

function formatQuickReplyFixMessage(result) {
  const parts = [];

  if (result.autoFilledNodeIds.length > 0) {
    const count = result.autoFilledNodeIds.length;
    parts.push(`added default message text to ${count} button node${count === 1 ? '' : 's'}`);
  }

  if (result.normalizedButtonNodeIds.length > 0) {
    const count = result.normalizedButtonNodeIds.length;
    parts.push(`cleaned blank or extra buttons on ${count} node${count === 1 ? '' : 's'}`);
  }

  return `Fixed quick replies before saving: ${parts.join('; ')}.`;
}

function decorateEdgesForCanvas(edges = []) {
  return edges.map((edge) => {
    const selected = Boolean(edge.selected);
    const baseStyle = edge.style || {};
    const edgeColor = getEdgeColor(edge);

    return {
      ...defaultEdgeOptions,
      ...edge,
      type: 'visibleLink',
      animated: selected ? true : edge.animated ?? defaultEdgeOptions.animated,
      zIndex: selected ? 20 : (edge.zIndex ?? defaultEdgeOptions.zIndex),
      interactionWidth: Math.max(edge.interactionWidth || defaultEdgeOptions.interactionWidth || 24, 24),
      label: getEdgeLabel(edge),
      style: {
        ...defaultEdgeOptions.style,
        ...baseStyle,
        stroke: edgeColor,
        strokeWidth: selected ? 2.6 : 1.8,
        strokeDasharray: selected ? '1 8' : '1 7',
        strokeLinecap: 'round',
      },
    };
  });
}

function VisibleLinkEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  sourceHandleId,
  style,
  onDelete,
}) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.35,
  });
  const edgeColor = getEdgeColor({ selected, sourceHandle: sourceHandleId });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        interactionWidth={42}
        style={{
          ...style,
          stroke: edgeColor,
          strokeWidth: selected ? 2.4 : 1.6,
          strokeDasharray: selected ? '1 8' : '1 7',
          strokeLinecap: 'round',
          filter: selected ? 'drop-shadow(0 2px 4px rgba(15, 23, 42, 0.16))' : 'none',
        }}
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: selected ? 'all' : 'none',
          }}
        >
          {selected ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(id);
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-red-50 text-xs text-red-600 shadow-md transition-all hover:bg-red-100"
              title="Delete link"
              aria-label="Delete link"
            >
              <IoTrash />
            </button>
          ) : null}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export default function FlowCanvas({ initialNodes, initialEdges, onSave, onStateChange, showGuidedCreate = false }) {
  const { confirm, confirmDialog } = useConfirmDialog();
  const reactFlowWrapper = useRef(null);
  const historyRef = useRef({ past: [], future: [] });
  const dragSnapshotRef = useRef(null);
  const starterNodes = initialNodes || [
    { id: 'start_1', type: 'startNode', position: { x: 350, y: 100 }, data: { label: 'When user messages', triggerType: 'all' } },
  ];
  const [nodes, setNodes] = useState(starterNodes);
  const [edges, setEdges] = useState(decorateEdgesForCanvas(sanitizeEdgesForRuntime(starterNodes, initialEdges || [])));
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [showHelp, setShowHelp] = useState(true);
  const [guideStepIndex, setGuideStepIndex] = useState(0);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    onStateChange?.({
      nodes,
      edges: sanitizeEdgesForRuntime(nodes, edges),
    });
  }, [edges, nodes, onStateChange]);

  useEffect(() => {
    if (!reactFlowInstance) return undefined;

    requestAnimationFrame(() => setViewport(reactFlowInstance.getViewport()));
    const viewportTimer = setTimeout(() => setViewport(reactFlowInstance.getViewport()), 250);
    return () => clearTimeout(viewportTimer);
  }, [edges.length, nodes.length, reactFlowInstance]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  const editingNode = useMemo(
    () => nodes.find((node) => node.id === editingNodeId) || null,
    [editingNodeId, nodes]
  );

  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) || null,
    [edges, selectedEdgeId]
  );

  const syncHistoryState = useCallback(() => {
    setHistoryState({
      canUndo: historyRef.current.past.length > 0,
      canRedo: historyRef.current.future.length > 0,
    });
  }, []);

  const captureSnapshot = useCallback(
    () => cloneCanvasState(nodesRef.current, edgesRef.current),
    []
  );

  const pushHistory = useCallback((snapshot) => {
    if (!snapshot) return;

    const nextPast = [...historyRef.current.past];
    const lastSnapshot = nextPast[nextPast.length - 1];
    if (lastSnapshot && areCanvasStatesEqual(lastSnapshot, snapshot)) return;

    nextPast.push(cloneCanvasState(snapshot.nodes, snapshot.edges));
    historyRef.current.past = nextPast.slice(-HISTORY_LIMIT);
    historyRef.current.future = [];
    syncHistoryState();
  }, [syncHistoryState]);

  const restoreSnapshot = useCallback((snapshot) => {
    if (!snapshot) return;

    setNodes(snapshot.nodes.map((node) => ({ ...node, selected: false })));
    setEdges(decorateEdgesForCanvas(sanitizeEdgesForRuntime(
      snapshot.nodes,
      snapshot.edges.map((edge) => ({ ...edge, selected: false }))
    )));
    setSelectedNodeId(null);
    setEditingNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  const undo = useCallback(() => {
    const previous = historyRef.current.past[historyRef.current.past.length - 1];
    if (!previous) return;

    const current = captureSnapshot();
    historyRef.current.past = historyRef.current.past.slice(0, -1);
    historyRef.current.future = [...historyRef.current.future, current];
    restoreSnapshot(previous);
    syncHistoryState();
  }, [captureSnapshot, restoreSnapshot, syncHistoryState]);

  const redo = useCallback(() => {
    const next = historyRef.current.future[historyRef.current.future.length - 1];
    if (!next) return;

    const current = captureSnapshot();
    historyRef.current.future = historyRef.current.future.slice(0, -1);
    historyRef.current.past = [...historyRef.current.past, current].slice(-HISTORY_LIMIT);
    restoreSnapshot(next);
    syncHistoryState();
  }, [captureSnapshot, restoreSnapshot, syncHistoryState]);

  const onNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const onEdgesChange = useCallback((changes) => {
    setEdges((eds) => decorateEdgesForCanvas(applyEdgeChanges(changes, eds)));
  }, []);

  const onConnect = useCallback((params) => {
    if (!params.source || !params.target || params.source === params.target) return;

    const sourceNode = nodesRef.current.find((node) => node.id === params.source);
    if (!sourceNode || sourceNode.type === 'endNode') return;

    const currentEdges = edgesRef.current;
    const alreadyExists = currentEdges.some((edge) => (
      edge.source === params.source
      && String(edge.sourceHandle || '') === String(params.sourceHandle || '')
      && edge.target === params.target
      && String(edge.targetHandle || '') === String(params.targetHandle || '')
    ));
    if (alreadyExists) return;

    const connectionScope = getConnectionScope(sourceNode, params.sourceHandle);
    const nextEdges = connectionScope
      ? currentEdges.filter((edge) => {
        if (connectionScope.type === 'single') {
          return edge.source !== params.source;
        }

        return !(
          edge.source === params.source
          && String(edge.sourceHandle || '') === String(params.sourceHandle || '')
        );
      })
      : currentEdges;

    pushHistory(captureSnapshot());
    setEdges(decorateEdgesForCanvas(addEdge({ ...params, ...defaultEdgeOptions }, nextEdges)));
    setSelectedNodeId(null);
    setEditingNodeId(null);
    setSelectedEdgeId(null);
    setShowHelp(false);
  }, [captureSnapshot, pushHistory]);

  const isValidConnection = useCallback((connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) {
      return false;
    }

    const sourceNode = nodesRef.current.find((node) => node.id === connection.source);
    const targetNode = nodesRef.current.find((node) => node.id === connection.target);
    if (!sourceNode || !targetNode) return false;

    if (sourceNode.type === 'endNode' || targetNode.type === 'startNode') {
      return false;
    }

    return true;
  }, []);

  const onNodeClick = useCallback((_, node) => {
    setSelectedNodeId(node.id);
    setEditingNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  const openNodeEditor = useCallback((nodeId) => {
    if (!nodeId) return;
    setSelectedNodeId(nodeId);
    setEditingNodeId(nodeId);
    setSelectedEdgeId(null);
  }, []);

  const onNodeDoubleClick = useCallback((_, node) => {
    openNodeEditor(node.id);
  }, [openNodeEditor]);

  const selectEdge = useCallback((edgeId) => {
    setSelectedEdgeId(edgeId);
    setSelectedNodeId(null);
    setEditingNodeId(null);
  }, []);

  const onEdgeClick = useCallback((event, edge) => {
    event.preventDefault();
    selectEdge(edge.id);
  }, [selectEdge]);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setEditingNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  const onSelectionChange = useCallback(({ nodes: selectedNodes, edges: selectedEdges }) => {
    const nextSelectedNodeId = selectedNodes[0]?.id || null;
    const nextSelectedEdgeId = selectedEdges[0]?.id || null;

    setSelectedNodeId(nextSelectedNodeId);
    setSelectedEdgeId(nextSelectedEdgeId);
    if (nextSelectedNodeId !== editingNodeId) {
      setEditingNodeId(null);
    }
  }, [editingNodeId]);

  const onFlowInit = useCallback((instance) => {
    setReactFlowInstance(instance);
    requestAnimationFrame(() => setViewport(instance.getViewport()));
    setTimeout(() => setViewport(instance.getViewport()), 120);
  }, []);

  const onFlowMove = useCallback((_, nextViewport) => {
    setViewport(nextViewport);
  }, []);

  const onUpdateNodeData = useCallback((id, newData) => {
    pushHistory(captureSnapshot());
    setNodes((nds) => nds.map((node) => (node.id === id ? { ...node, data: newData } : node)));
  }, [captureSnapshot, pushHistory]);

  const deleteNode = useCallback((id) => {
    const node = nodesRef.current.find((item) => item.id === id);
    if (!node) return;
    if (node.type === 'startNode') {
      toast.error('Start trigger cannot be deleted');
      return;
    }

    pushHistory(captureSnapshot());
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => decorateEdgesForCanvas(eds.filter((e) => e.source !== id && e.target !== id)));
    setSelectedNodeId(null);
    setEditingNodeId(null);
    setSelectedEdgeId(null);
  }, [captureSnapshot, pushHistory]);

  const deleteSelectedEdge = useCallback((id) => {
    if (!id) return;

    pushHistory(captureSnapshot());
    setEdges((eds) => decorateEdgesForCanvas(eds.filter((edge) => edge.id !== id)));
    setEditingNodeId(null);
    setSelectedEdgeId(null);
  }, [captureSnapshot, pushHistory]);

  const deleteSelection = useCallback(() => {
    if (selectedEdgeId) {
      deleteSelectedEdge(selectedEdgeId);
      return;
    }

    if (selectedNodeId) {
      deleteNode(selectedNodeId);
    }
  }, [deleteNode, deleteSelectedEdge, selectedEdgeId, selectedNodeId]);

  const loadTemplate = async (templateKey) => {
    const approved = await confirm({
      title: 'Replace Canvas',
      message: 'This will replace your current flow canvas with the selected template. Continue?',
      confirmLabel: 'Use Template',
      tone: 'primary',
    });
    if (!approved) return;
    const { nodes: newNodes, edges: newEdges } = createTemplateCanvasState(templateKey);
    pushHistory(captureSnapshot());
    setNodes(newNodes);
    setEdges(decorateEdgesForCanvas(sanitizeEdgesForRuntime(newNodes, newEdges)));
    setSelectedNodeId(null);
    setEditingNodeId(null);
    setSelectedEdgeId(null);
    setShowHelp(false);
    setTimeout(() => {
      if (reactFlowInstance) reactFlowInstance.fitView({ padding: 0.15, duration: 600 });
    }, 100);
  };

  const addNode = useCallback((type, data, position) => {
    const newNode = {
      id: getId(), type,
      position: position || { x: 350, y: (nodesRef.current.length + 1) * 160 },
      data: { ...data },
    };
    pushHistory(captureSnapshot());
    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(newNode.id);
    setEditingNodeId(null);
    setSelectedEdgeId(null);
    setShowHelp(false);
  }, [captureSnapshot, pushHistory]);

  const addGuidedNode = useCallback((type, data) => {
    addNode(type, data);
    setGuideStepIndex((current) => Math.min(current + 1, 2));
  }, [addNode]);

  const onDragOver = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }, []);
  const onDrop = useCallback((e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('application/reactflow');
    if (!type || !reactFlowInstance) return;
    const rawData = e.dataTransfer.getData('application/reactflow-data');
    let droppedData = defaultData[type] || {};
    if (rawData) {
      try {
        droppedData = JSON.parse(rawData);
      } catch {
        droppedData = defaultData[type] || {};
      }
    }
    const position = reactFlowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addNode(type, droppedData, position);
  }, [reactFlowInstance, addNode]);

  const onNodeDragStart = useCallback(() => {
    dragSnapshotRef.current = captureSnapshot();
  }, [captureSnapshot]);

  const onNodeDragStop = useCallback(() => {
    if (!dragSnapshotRef.current) return;

    const nextSnapshot = captureSnapshot();
    if (!areCanvasStatesEqual(dragSnapshotRef.current, nextSnapshot)) {
      pushHistory(dragSnapshotRef.current);
    }
    dragSnapshotRef.current = null;
  }, [captureSnapshot, pushHistory]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isEditable = target instanceof HTMLElement && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.isContentEditable
      );
      if (isEditable) return;

      const isModifierPressed = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();

      if (isModifierPressed && key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
        return;
      }

      if (isModifierPressed && (key === 'y' || (event.shiftKey && key === 'z'))) {
        event.preventDefault();
        redo();
        return;
      }

      if ((event.key === 'Delete' || event.key === 'Backspace') && (selectedNodeId || selectedEdgeId)) {
        event.preventDefault();
        deleteSelection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [deleteSelection, redo, selectedEdgeId, selectedNodeId, undo]);

  const handleSaveClick = useCallback(() => {
    const sanitizeResult = sanitizeFlowNodesForSave(nodes);
    const saveNodes = sanitizeResult.nodes;

    if (sanitizeResult.changed) {
      pushHistory(captureSnapshot());
      setNodes(saveNodes);
      nodesRef.current = saveNodes;

      const changedNodeId = sanitizeResult.autoFilledNodeIds[0] || sanitizeResult.normalizedButtonNodeIds[0] || null;
      if (changedNodeId) {
        setSelectedNodeId(changedNodeId);
        setEditingNodeId(null);
        setSelectedEdgeId(null);
      }

      toast.success(formatQuickReplyFixMessage(sanitizeResult));
    }

    onSave({ nodes: saveNodes, edges: sanitizeEdgesForRuntime(saveNodes, edges) });
  }, [captureSnapshot, edges, nodes, onSave, pushHistory]);

  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const fitViewOptions = nodeCount <= 1
    ? { padding: 0.35, maxZoom: 0.78 }
    : { padding: 0.2, maxZoom: 0.95 };
  const deleteLabel = selectedEdge ? 'Delete Link' : 'Delete Node';
  const canEditSelectedNode = Boolean(selectedNode);
  const selectedSummary = selectedNode
    ? `Selected: ${selectedNode.data?.label || selectedNode.data?.text || selectedNode.type}. Click Edit or double-click the node to open fields.`
    : selectedEdge
      ? 'Selected: connection link. Click Delete Link to remove it.'
      : 'Select a node or connection to delete it.';
  const edgeTypes = useMemo(() => ({
    visibleLink: (edgeProps) => (
      <VisibleLinkEdge
        {...edgeProps}
        onDelete={deleteSelectedEdge}
      />
    ),
  }), [deleteSelectedEdge]);
  const overlayLinks = useMemo(() => {
    const nodeLookup = new Map(nodes.map((node) => [node.id, node]));

    return edges
      .map((edge) => {
        const sourceNode = nodeLookup.get(edge.source);
        const targetNode = nodeLookup.get(edge.target);
        if (!sourceNode || !targetNode) return null;

        const source = toScreenPoint(getSourceAnchor(sourceNode, edge.sourceHandle), viewport);
        const target = toScreenPoint(getTargetAnchor(targetNode), viewport);
        const color = getEdgeColor(edge);
        const path = buildOverlayPath(source, target);
        const labelX = (source.x + target.x) / 2;
        const labelY = (source.y + target.y) / 2;

        return {
          id: edge.id,
          color,
          label: getEdgeLabel(edge),
          path,
          selected: edge.id === selectedEdgeId || Boolean(edge.selected),
          labelX,
          labelY,
        };
      })
      .filter(Boolean);
  }, [edges, nodes, selectedEdgeId, viewport]);
  const guidedSteps = useMemo(() => ([
    {
      title: 'Set flow details',
      description: 'Enter the flow name and choose the trigger in the top settings bar before building the journey.',
      addLabel: null,
      onAdd: null,
    },
    {
      title: 'Add first message',
      description: 'Add a text message so the user sees the first reply as soon as the flow starts.',
      addLabel: 'Add Text Message',
      onAdd: () => addGuidedNode('messageNode', { ...defaultData.messageNode, messageType: 'text' }),
    },
    {
      title: 'Add the next step',
      description: 'Add a condition or end step to continue the conversation path after the first message.',
      addLabel: 'Add Condition',
      onAdd: () => addGuidedNode('conditionNode', { ...defaultData.conditionNode }),
    },
  ]), [addGuidedNode]);
  const activeGuideStep = guidedSteps[guideStepIndex] || guidedSteps[0];
  const isLastGuideStep = guideStepIndex >= guidedSteps.length - 1;
  const handleGuideNext = useCallback(() => {
    if (isLastGuideStep) {
      setShowHelp(false);
      return;
    }

    setGuideStepIndex((current) => Math.min(current + 1, guidedSteps.length - 1));
  }, [guidedSteps.length, isLastGuideStep]);

  return (
    <div className="h-full w-full overflow-hidden bg-background">
      <div className="grid h-full min-h-0 grid-cols-1 grid-rows-[minmax(0,280px)_minmax(0,1fr)] overflow-hidden sm:grid-rows-[minmax(0,320px)_minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-1 xl:grid-cols-[330px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-b border-slate-200 bg-background p-3 shadow-[8px_0_24px_rgba(15,23,42,0.04)] sm:p-4 lg:border-b-0 lg:border-r">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <NodePalette onAddNode={addNode} />
          </div>
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm sm:mt-4">
            <div className="mb-2.5 grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-center">
                <p className="text-[1.35rem] font-black leading-none text-slate-900">{nodeCount}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Nodes</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-center">
                <p className="text-[1.35rem] font-black leading-none text-slate-900">{edgeCount}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Links</p>
              </div>
            </div>

            <div className="mb-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={undo}
                disabled={!historyState.canUndo}
                title="Undo"
                aria-label="Undo"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <IoArrowUndo />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!historyState.canRedo}
                title="Redo"
                aria-label="Redo"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <IoArrowRedo />
              </button>
              <button
                type="button"
                onClick={() => openNodeEditor(selectedNodeId)}
                disabled={!canEditSelectedNode}
                title="Edit selected node"
                aria-label="Edit selected node"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-sm text-blue-600 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <IoCreate />
              </button>
              <button
                type="button"
                onClick={deleteSelection}
                disabled={!selectedNodeId && !selectedEdgeId}
                title={deleteLabel}
                aria-label={deleteLabel}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-sm text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <IoTrash />
              </button>
            </div>

            <p className="mb-2.5 min-h-[28px] rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] leading-relaxed text-slate-500">
              {selectedSummary}
            </p>

            <button onClick={handleSaveClick}
              className="w-full rounded-lg bg-primary px-4 py-2 text-[13px] font-black text-white shadow-lg shadow-primary/25 transition-all hover:bg-primary-hover active:scale-[0.98]">
              Save
            </button>
          </div>
        </aside>

        <div className="relative min-h-0 min-w-0 overflow-hidden bg-white" ref={reactFlowWrapper}>
          {/* Help Guide - Collapsible */}
          {showHelp && nodeCount <= 1 && (
            <div className="absolute left-3 right-3 top-3 z-10 overflow-hidden rounded-2xl border border-primary/20 bg-white shadow-xl shadow-primary/10 sm:left-5 sm:right-auto sm:top-5 sm:w-[280px]">
              <div className="flex items-center justify-between border-b border-primary/10 bg-primary-light px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-bold text-emerald-900">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-black text-white">?</span>
                  {showGuidedCreate ? 'Create new flow' : 'How to build your flow'}
                </h3>
                <button onClick={() => setShowHelp(false)} className="text-xs font-bold text-emerald-600 hover:text-emerald-800">Skip</button>
              </div>
              {showGuidedCreate ? (
                <div className="p-4">
                  <div className="mb-3 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    <span>{`Step ${guideStepIndex + 1} of ${guidedSteps.length}`}</span>
                    <div className="flex items-center gap-1">
                      {guidedSteps.map((step, index) => (
                        <span
                          key={step.title}
                          className={`h-1.5 w-6 rounded-full ${index <= guideStepIndex ? 'bg-primary' : 'bg-emerald-100'}`}
                        />
                      ))}
                    </div>
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900">{activeGuideStep.title}</h4>
                  <p className="mt-2 text-xs leading-relaxed text-gray-600">{activeGuideStep.description}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {activeGuideStep.onAdd ? (
                      <button
                        type="button"
                        onClick={activeGuideStep.onAdd}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-hover"
                      >
                        <IoAdd />
                        {activeGuideStep.addLabel}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleGuideNext}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    >
                      {isLastGuideStep ? 'Done' : 'Next'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 p-4">
                  {[
                    { n: '1', text: <><strong>Drag blocks</strong> from the left panel onto the canvas</> },
                    { n: '2', text: <><strong>Select a block</strong>, then click <strong>Edit</strong> or double-click it to configure</> },
                    { n: '3', text: <><strong>Connect blocks</strong> by dragging from one handle to another</> },
                    { n: '4', text: <>Click <strong>Save</strong> when the journey is ready</> },
                  ].map(s => (
                    <div key={s.n} className="flex items-start gap-2.5">
                      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-light text-[10px] font-bold text-emerald-700">{s.n}</div>
                      <p className="text-xs leading-relaxed text-gray-600">{s.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Template shortcuts are hidden so the editor shows only the active flow canvas. */}
          <div className="hidden">
            <span className="px-3 text-[10px] font-black uppercase tracking-widest text-gray-500">Template</span>
            <div className="h-5 w-px bg-gray-200" />
            {Object.entries(autoTemplates).map(([key, tpl]) => (
              <div key={key} className="relative group/tpl">
                <button onClick={() => loadTemplate(key)}
                  className="whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold text-gray-700 transition-colors hover:bg-gray-100">
                  {tpl.label}
                </button>
                <div className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover/tpl:opacity-100">
                  {tpl.desc}
                </div>
              </div>
            ))}
          </div>

          {/* Main Canvas */}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            onSelectionChange={onSelectionChange}
            onInit={onFlowInit}
            onMove={onFlowMove}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            isValidConnection={isValidConnection}
            connectionLineType={ConnectionLineType.Bezier}
            connectionLineStyle={{ stroke: '#0f766e', strokeWidth: 2.4, strokeDasharray: '1 8', strokeLinecap: 'round' }}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={36}
            connectOnClick
            nodesConnectable
            elevateEdgesOnSelect
            fitView
            fitViewOptions={fitViewOptions}
            deleteKeyCode={null}
          >
            <Background variant="dots" gap={16} size={1.4} color="#cbd5e1" />
            <Controls className="!rounded-2xl !border-slate-200 !bg-white !shadow-md" showInteractive={true} />
            <MiniMap
              nodeColor={(n) => {
                if (n.type === 'startNode') return '#10b981';
                if (n.type === 'messageNode') return '#2563eb';
                if (n.type === 'conditionNode') return '#f59e0b';
                if (n.type === 'delayNode') return '#a855f7';
                if (n.type === 'apiNode') return '#06b6d4';
                if (n.type === 'endNode') return '#ef4444';
                return '#94a3b8';
              }}
              className="!rounded-2xl !border-slate-200 !bg-white/90 !shadow-md"
              maskColor="rgba(15,23,42,0.08)"
            />
          </ReactFlow>

          <svg
            className="pointer-events-none absolute inset-0 z-20 h-full w-full max-w-none overflow-hidden"
            style={{ maxWidth: 'none' }}
          >
            {overlayLinks.map((link) => (
              <g key={link.id}>
                <path
                  d={link.path}
                  fill="none"
                  stroke={link.color}
                  strokeWidth={link.selected ? 2.4 : 1.6}
                  strokeDasharray={link.selected ? '1 8' : '1 7'}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    cursor: 'pointer',
                    filter: link.selected ? 'drop-shadow(0 2px 4px rgba(15, 23, 42, 0.16))' : 'none',
                    pointerEvents: 'stroke',
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    selectEdge(link.id);
                  }}
                />
              </g>
            ))}
          </svg>

          <div className="pointer-events-none absolute inset-0 z-30">
            {overlayLinks.map((link) => (
              <div
                key={`${link.id}-label`}
                className="absolute -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: link.labelX,
                  top: link.labelY,
                  pointerEvents: link.selected ? 'auto' : 'none',
                }}
              >
                {link.selected ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteSelectedEdge(link.id);
                    }}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-red-50 text-xs text-red-600 shadow-md transition-all hover:bg-red-100"
                    title="Delete link"
                    aria-label="Delete link"
                  >
                    <IoTrash />
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Properties Panel */}
      {editingNode && (
        <PropertiesPanel
          node={editingNode}
          onUpdate={onUpdateNodeData}
          onClose={() => setEditingNodeId(null)}
          onDelete={() => deleteNode(editingNode.id)}
        />
      )}
      {confirmDialog}
    </div>
  );
}
