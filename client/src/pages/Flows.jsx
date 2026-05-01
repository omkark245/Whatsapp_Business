import { useCallback, useEffect, useState } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import {
  IoAdd,
  IoArrowBack,
  IoChevronDown,
  IoCopy,
  IoCreate,
  IoGitNetwork,
  IoPause,
  IoPlay,
  IoTrash,
} from 'react-icons/io5';
import toast from 'react-hot-toast';
import api from '../services/api';
import useAccountStore from '../store/accountStore';
import FlowCanvas from '../components/FlowBuilder/FlowCanvas';
import AppSelect from '../components/ui/AppSelect';
import useConfirmDialog from '../hooks/useConfirmDialog';
import { showApiError } from '../utils/apiError';

const DEFAULT_FLOW_META = {
  name: '',
  triggerType: 'all',
  triggerValue: '',
};

const FLOW_DRAFT_STORAGE_PREFIX = 'flow-builder-draft';

function getFlowDraftStorageKey(accountId) {
  return `${FLOW_DRAFT_STORAGE_PREFIX}:${accountId || 'default'}`;
}

function buildNewFlowStarterState() {
  return {
    meta: { ...DEFAULT_FLOW_META },
    nodes: [
      {
        id: 'start_1',
        type: 'startNode',
        position: { x: 350, y: 100 },
        data: { label: 'When user messages', triggerType: 'all' },
      },
    ],
    edges: [],
  };
}

function normalizeCanvasState(flowData = {}) {
  const nodes = Array.isArray(flowData?.nodes)
    ? flowData.nodes.map((node, index) => ({
      ...node,
      position: node.position || { x: 350, y: index * 160 },
    }))
    : [];
  const edges = Array.isArray(flowData?.edges) ? flowData.edges : [];

  return { nodes, edges };
}

function normalizeStoredDraft(storedDraft) {
  if (!storedDraft || typeof storedDraft !== 'object') return null;

  const { nodes, edges } = normalizeCanvasState(storedDraft);
  if (nodes.length === 0) return null;

  return {
    meta: {
      name: typeof storedDraft.meta?.name === 'string' ? storedDraft.meta.name : '',
      triggerType: ['keyword', 'all', 'none'].includes(storedDraft.meta?.triggerType)
        ? storedDraft.meta.triggerType
        : DEFAULT_FLOW_META.triggerType,
      triggerValue: typeof storedDraft.meta?.triggerValue === 'string' ? storedDraft.meta.triggerValue : '',
    },
    nodes,
    edges,
  };
}

function readStoredDraft(storageKey) {
  if (!storageKey) return null;

  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return null;
    return normalizeStoredDraft(JSON.parse(stored));
  } catch {
    return null;
  }
}

function createCanvasSeed(nodes, edges, scope) {
  return {
    key: `${scope}-${Date.now()}`,
    nodes,
    edges,
  };
}

export default function Flows() {
  const { activeAccount } = useAccountStore();
  const activeAccountId = activeAccount?.id || null;
  const { confirm, confirmDialog } = useConfirmDialog();
  const navigate = useNavigate();
  const newRouteMatch = useMatch('/flows/new');
  const editRouteMatch = useMatch('/flows/:flowId/edit');
  const routeMode = newRouteMatch ? 'new' : editRouteMatch ? 'edit' : 'list';
  const editingFlowId = editRouteMatch?.params?.flowId || null;

  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderError, setBuilderError] = useState('');
  const [flowMeta, setFlowMeta] = useState(DEFAULT_FLOW_META);
  const [showMeta, setShowMeta] = useState(true);
  const [canvasSeed, setCanvasSeed] = useState(null);
  const [canvasState, setCanvasState] = useState(null);
  const triggerTypeOptions = [
    { value: 'all', label: 'All Messages' },
    { value: 'keyword', label: 'Keyword' },
    { value: 'none', label: 'Manual' },
  ];

  const draftStorageKey = activeAccountId ? getFlowDraftStorageKey(activeAccountId) : null;

  const isBuilderMode = routeMode !== 'list';
  const loadFlows = useCallback(async () => {
    if (!activeAccountId) {
      setFlows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.get(`/flows/${activeAccountId}`);
      setFlows(data.flows || []);
    } catch (error) {
      showApiError(error, 'Failed to load flows');
    }
    setLoading(false);
  }, [activeAccountId]);

  useEffect(() => {
    queueMicrotask(() => {
      void loadFlows();
    });
  }, [loadFlows]);

  const clearDraft = useCallback(() => {
    if (!draftStorageKey) return;

    try {
      window.localStorage.removeItem(draftStorageKey);
    } catch {
      // Ignore storage failures; the builder still works.
    }
  }, [draftStorageKey]);

  const bootNewFlowBuilder = useCallback((nextState) => {
    setBuilderError('');
    setShowMeta(true);
    setFlowMeta(nextState.meta);
    setCanvasState({ nodes: nextState.nodes, edges: nextState.edges });
    setCanvasSeed(createCanvasSeed(nextState.nodes, nextState.edges, 'new-flow'));
  }, []);

  const resetBuilderToListState = useCallback(() => {
    setBuilderLoading(false);
    setBuilderError('');
    setCanvasSeed(null);
    setCanvasState(null);
    setFlowMeta(DEFAULT_FLOW_META);
  }, []);

  const clearBuilderCanvas = useCallback(() => {
    setCanvasSeed(null);
    setCanvasState(null);
  }, []);

  const showInvalidBuilderRoute = useCallback(() => {
    setBuilderLoading(false);
    setBuilderError('Flow route is invalid.');
    clearBuilderCanvas();
  }, [clearBuilderCanvas]);

  const startEditFlowLoading = useCallback(() => {
    setBuilderLoading(true);
    clearBuilderCanvas();
  }, [clearBuilderCanvas]);

  const applyLoadedFlow = useCallback((flow, fallbackFlowId) => {
    const normalizedCanvas = normalizeCanvasState(flow?.flowData);
    setFlowMeta({
      name: flow?.name || '',
      triggerType: flow?.triggerType || DEFAULT_FLOW_META.triggerType,
      triggerValue: flow?.triggerValue || '',
    });
    setCanvasState(normalizedCanvas);
    setCanvasSeed(createCanvasSeed(normalizedCanvas.nodes, normalizedCanvas.edges, `edit-${flow?.id || fallbackFlowId}`));
    setBuilderLoading(false);
  }, []);

  const showBuilderLoadError = useCallback(() => {
    setBuilderLoading(false);
    setBuilderError('Failed to load this flow.');
  }, []);

  const prepareBuilderShell = useCallback(() => {
    setShowMeta(true);
    setBuilderError('');
  }, []);

  useEffect(() => {
    let isCancelled = false;

    const syncBuilderRoute = async () => {
      await Promise.resolve();
      if (isCancelled) return;

      if (!isBuilderMode) {
        resetBuilderToListState();
        return;
      }

      prepareBuilderShell();

      if (routeMode === 'new') {
        if (!activeAccountId) {
          resetBuilderToListState();
          return;
        }
        clearDraft();
        bootNewFlowBuilder(buildNewFlowStarterState());
        return;
      }

      if (!editingFlowId) {
        showInvalidBuilderRoute();
        return;
      }

      startEditFlowLoading();

      try {
        const { data } = await api.get(`/flows/detail/${editingFlowId}`);
        if (isCancelled) return;
        applyLoadedFlow(data.flow, editingFlowId);
      } catch (error) {
        if (isCancelled) return;
        showBuilderLoadError();
        showApiError(error, 'Failed to load flow');
      }
    };

    void syncBuilderRoute();

    return () => {
      isCancelled = true;
    };
  }, [
    activeAccountId,
    applyLoadedFlow,
    bootNewFlowBuilder,
    draftStorageKey,
    editingFlowId,
    isBuilderMode,
    prepareBuilderShell,
    resetBuilderToListState,
    routeMode,
    showBuilderLoadError,
    showInvalidBuilderRoute,
    startEditFlowLoading,
    clearDraft,
  ]);

  useEffect(() => {
    if (routeMode !== 'new' || !draftStorageKey || !canvasState) {
      return;
    }

    try {
      window.localStorage.setItem(draftStorageKey, JSON.stringify({
        meta: flowMeta,
        nodes: canvasState.nodes,
        edges: canvasState.edges,
      }));
    } catch {
      // Ignore storage failures; the builder still works.
    }
  }, [canvasState, draftStorageKey, flowMeta, routeMode]);

  const openNewFlow = useCallback(() => {
    navigate('/flows/new');
  }, [navigate]);

  const openEditFlow = useCallback((flow) => {
    navigate(`/flows/${flow.id}/edit`);
  }, [navigate]);

  const closeBuilder = useCallback(() => {
    navigate('/flows');
  }, [navigate]);

  const handleSave = async ({ nodes, edges }) => {
    const trimmedName = flowMeta.name.trim();
    if (!trimmedName) {
      toast.error('Please enter a flow name');
      setShowMeta(true);
      return;
    }

    if (!activeAccountId && routeMode === 'new') {
      toast.error('Select a WhatsApp account before creating a flow');
      return;
    }

    const payload = {
      name: trimmedName,
      triggerType: flowMeta.triggerType,
      triggerValue: flowMeta.triggerType === 'keyword' ? flowMeta.triggerValue.trim() : '',
      flowData: { nodes, edges },
    };

    try {
      if (routeMode === 'edit' && editingFlowId) {
        await api.put(`/flows/${editingFlowId}`, payload);
      } else {
        await api.post(`/flows/${activeAccountId}`, payload);
        clearDraft();
      }

      toast.success(routeMode === 'edit' ? 'Flow updated!' : 'Flow created!');
      await loadFlows();
      navigate('/flows', { replace: true });
    } catch (error) {
      showApiError(error, 'Failed to save flow');
    }
  };

  const toggle = async (id) => {
    try {
      await api.patch(`/flows/${id}/toggle`);
      await loadFlows();
    } catch (error) {
      showApiError(error, 'Failed to update flow');
    }
  };

  const remove = async (id) => {
    const approved = await confirm({
      title: 'Delete Flow',
      message: 'Delete this flow permanently?',
      confirmLabel: 'Delete Flow',
    });
    if (!approved) return;

    try {
      await api.delete(`/flows/${id}`);
      await loadFlows();
    } catch (error) {
      showApiError(error, 'Failed to delete flow');
    }
  };

  const duplicate = async (flow) => {
    if (!activeAccountId) {
      toast.error('Select a WhatsApp account before duplicating a flow');
      return;
    }

    try {
      await api.post(`/flows/${activeAccountId}`, {
        name: `${flow.name} (Copy)`,
        triggerType: flow.triggerType,
        triggerValue: flow.triggerValue,
        flowData: flow.flowData,
      });
      toast.success('Flow duplicated!');
      await loadFlows();
    } catch (error) {
      showApiError(error, 'Failed to duplicate flow');
    }
  };

  const createStarterFlow = async () => {
    if (!activeAccountId) {
      toast.error('Select a WhatsApp account before creating a starter flow');
      return;
    }

    try {
      await api.post(`/flows/${activeAccountId}/starter`, {
        templateKey: 'finlec_business_enquiry',
      });
      toast.success('Starter flow created and activated!');
      await loadFlows();
    } catch (error) {
      showApiError(error, 'Failed to create starter flow');
    }
  };

  if (isBuilderMode) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="z-10 flex flex-wrap items-center gap-3 border-b border-gray-100 bg-white px-4 py-3 shadow-sm">
          <button
            onClick={closeBuilder}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            <IoArrowBack /> Back
          </button>
          <div className="hidden h-5 w-px bg-gray-200 sm:block" />
          <h2 className="min-w-0 flex-1 text-sm font-semibold text-gray-800">
            {routeMode === 'edit' ? `Edit: ${flowMeta.name || 'Flow'}` : 'New Flow'}
          </h2>
          <button
            onClick={() => setShowMeta((current) => !current)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            Settings <IoChevronDown className={`transition-transform ${showMeta ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="border-b border-gray-100 bg-emerald-50/60 px-4 py-2.5 text-xs font-medium text-emerald-800">
          Set the flow name, choose the trigger, edit nodes and messages, save, then activate it from the list if needed.
        </div>

        {showMeta && !builderLoading && canvasSeed && (
          <div className="grid grid-cols-1 gap-4 border-b border-gray-100 bg-white px-4 py-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,260px)_180px_minmax(0,260px)] xl:items-end">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Flow Name</label>
              <input
                type="text"
                value={flowMeta.name}
                onChange={(event) => setFlowMeta((current) => ({ ...current, name: event.target.value }))}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="Enter flow name"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Trigger</label>
              <AppSelect
                value={flowMeta.triggerType}
                onChange={(value) => setFlowMeta((current) => ({
                  ...current,
                  triggerType: value,
                  triggerValue: value === 'keyword' ? current.triggerValue : '',
                }))}
                options={triggerTypeOptions}
              />
            </div>
            {flowMeta.triggerType === 'keyword' && (
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">Keywords</label>
                <input
                  type="text"
                  value={flowMeta.triggerValue}
                  onChange={(event) => setFlowMeta((current) => ({ ...current, triggerValue: event.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  placeholder="Enter trigger keywords"
                />
              </div>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 bg-background">
          {!activeAccountId && routeMode === 'new' ? (
            <div className="flex h-full items-center justify-center p-4">
              <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">No active WhatsApp account</h3>
                <p className="mt-2 text-sm text-slate-500">Connect or select an account before creating a new flow.</p>
                <button
                  type="button"
                  onClick={closeBuilder}
                  className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
                >
                  Back to Flows
                </button>
              </div>
            </div>
          ) : builderLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : builderError ? (
            <div className="flex h-full items-center justify-center p-4">
              <div className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-6 text-center shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">Unable to open flow</h3>
                <p className="mt-2 text-sm text-slate-500">{builderError}</p>
                <button
                  type="button"
                  onClick={closeBuilder}
                  className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-hover"
                >
                  Back to Flows
                </button>
              </div>
            </div>
          ) : canvasSeed ? (
            <FlowCanvas
              key={canvasSeed.key}
              initialNodes={canvasSeed.nodes}
              initialEdges={canvasSeed.edges}
              onSave={handleSave}
              onStateChange={setCanvasState}
              showGuidedCreate={routeMode === 'new'}
            />
          ) : null}
        </div>
        {confirmDialog}
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 overflow-x-hidden overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Chatbot Flows</h1>
            <p className="mt-0.5 text-sm text-gray-500">Build visual automation flows for WhatsApp</p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <button
              onClick={createStarterFlow}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100 sm:w-auto"
            >
              <IoGitNetwork /> Create Starter Flow
            </button>
            <button
              onClick={openNewFlow}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/25 transition-colors hover:bg-primary-hover sm:w-auto"
            >
              <IoAdd /> New Flow
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : flows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-gray-100">
              <IoGitNetwork className="text-3xl text-gray-300" />
            </div>
            <p className="font-medium text-gray-500">No flows yet</p>
            <p className="mt-1 text-sm text-gray-400">Create visual chatbot flows to automate conversations</p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button
                onClick={createStarterFlow}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
              >
                Create starter flow
              </button>
              <button
                onClick={openNewFlow}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm shadow-primary/25 hover:bg-primary-hover"
              >
                Create your first flow
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {flows.map((flow) => {
              const nodeCount = flow.flowData?.nodes?.length || 0;
              const edgeCount = flow.flowData?.edges?.length || 0;
              const nodeTypes = [...new Set(flow.flowData?.nodes?.map((node) => node.type) || [])];

              return (
                <div key={flow.id} className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:shadow-md">
                  <div className={`h-1.5 ${flow.isActive ? 'bg-gradient-to-r from-emerald-400 via-blue-500 to-purple-500' : 'bg-gray-200'}`} />
                  <div className="p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="truncate font-semibold text-gray-800">{flow.name}</h3>
                      <span className={`rounded-lg border px-2.5 py-1 text-[10px] font-bold ${flow.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-gray-200 bg-gray-100 text-gray-500'}`}>
                        {flow.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="mb-3 flex flex-wrap gap-1.5">
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">
                        {flow.triggerType}{flow.triggerValue ? `: ${flow.triggerValue}` : ''}
                      </span>
                      <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600">{`${nodeCount} nodes`}</span>
                      <span className="rounded-md bg-purple-50 px-2 py-0.5 text-[10px] font-bold text-purple-600">{`${edgeCount} connections`}</span>
                    </div>

                    <div className="mb-4 flex gap-1">
                      {nodeTypes.includes('startNode') && <div className="h-3 w-3 rounded-full bg-emerald-400" title="Start" />}
                      {nodeTypes.includes('messageNode') && <div className="h-3 w-3 rounded-full bg-blue-400" title="Message" />}
                      {nodeTypes.includes('conditionNode') && <div className="h-3 w-3 rounded-full bg-amber-400" title="Condition" />}
                      {nodeTypes.includes('delayNode') && <div className="h-3 w-3 rounded-full bg-purple-400" title="Delay" />}
                      {nodeTypes.includes('apiNode') && <div className="h-3 w-3 rounded-full bg-cyan-400" title="API" />}
                      {nodeTypes.includes('endNode') && <div className="h-3 w-3 rounded-full bg-red-400" title="End" />}
                    </div>

                    <div className="flex flex-nowrap items-center gap-2">
                      <button
                        onClick={() => toggle(flow.id)}
                        className={`flex min-w-0 flex-1 items-center justify-center gap-1 rounded-xl border px-2 py-2 text-xs font-bold transition-colors ${
                          flow.isActive ? 'border-red-100 bg-red-50 text-red-600 hover:bg-red-100' : 'border-emerald-100 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                        }`}
                      >
                        {flow.isActive ? <><IoPause /> Pause</> : <><IoPlay /> Activate</>}
                      </button>
                      <button
                        onClick={() => openEditFlow(flow)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-xs text-blue-600 hover:bg-blue-100"
                        title="Edit flow"
                        aria-label={`Edit ${flow.name}`}
                      >
                        <IoCreate />
                      </button>
                      <button
                        onClick={() => duplicate(flow)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-xs text-gray-500 transition-all hover:bg-gray-100 md:opacity-0 md:group-hover:opacity-100"
                        title="Duplicate"
                      >
                        <IoCopy />
                      </button>
                      <button
                        onClick={() => remove(flow.id)}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-red-100 bg-red-50 text-xs text-red-600 transition-all hover:bg-red-100 md:opacity-0 md:group-hover:opacity-100"
                        title="Delete"
                      >
                        <IoTrash />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {confirmDialog}
    </div>
  );
}
