import { useState, useEffect, useRef } from 'react';
import { Eye, EyeOff, Check, X, Loader2, Edit2, Trash2, Plus, Menu, Github, Send, ShoppingBag, Activity } from 'lucide-react';
import { SettingsTab } from '../App';

interface SettingsViewProps {
  isConnected: boolean;
  settingsTab: SettingsTab;
  onMenuClick: () => void;
}

export default function SettingsView({ settingsTab, onMenuClick }: SettingsViewProps) {
  // --- Gateway settings state ---
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success?: boolean; message?: string } | null>(null);
  const [gatewaySaved, setGatewaySaved] = useState(false);
  const [gatewayError, setGatewayError] = useState(false);
  const [isDetectingAll, setIsDetectingAll] = useState(false);
  const [detectError, setDetectError] = useState('');
  const [maxPermissions, setMaxPermissions] = useState(false);
  const [isTogglingPermissions, setIsTogglingPermissions] = useState(false);
  const [allowedHosts, setAllowedHosts] = useState<string[]>([]);
  const [newHost, setNewHost] = useState('');
  const [editingHost, setEditingHost] = useState<string | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [restartSuccess, setRestartSuccess] = useState(false);

  // --- General settings state ---
  const [aiName, setAiName] = useState('我的小龙虾');
  const [loginEnabled, setLoginEnabled] = useState(false);
  const [loginPassword, setLoginPassword] = useState('123456');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [generalSaved, setGeneralSaved] = useState(false);
  const [generalError, setGeneralError] = useState(false);
  const [aiNameError, setAiNameError] = useState('');
  const [openclawWorkspace, setOpenclawWorkspace] = useState('');

  const getVisualLength = (str: string) => {
    let len = 0;
    for (let i = 0; i < str.length; i++) {
      if (str.charCodeAt(i) > 127) len += 2;
      else len += 1;
    }
    return len;
  };

  // --- Quick Commands state ---
  const [commands, setCommands] = useState<{ id: number; command: string; description: string }[]>([]);
  const [newCommand, setNewCommand] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);

  // --- Shared Delete Modal State ---
  type DeleteTarget = { type: 'host'; value: string } | { type: 'command'; id: number } | { type: 'model'; id: string } | { type: 'endpoint'; name: string };
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleteModalMessage, setDeleteModalMessage] = useState('');

  // --- Model Management State ---
  const [activeModelSubTab, setActiveModelSubTab] = useState<'endpoints' | 'models'>(() => {
    return (localStorage.getItem('openclaw_activeModelSubTab') as 'endpoints' | 'models') || 'endpoints';
  });

  useEffect(() => {
    localStorage.setItem('openclaw_activeModelSubTab', activeModelSubTab);
  }, [activeModelSubTab]);
  const [models, setModels] = useState<{ id: string; alias?: string; primary: boolean }[]>([]);
  const [newModelEndpoint, setNewModelEndpoint] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [newModelAlias, setNewModelAlias] = useState('');
  const [modelError, setModelError] = useState('');

  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [editingAlias, setEditingAlias] = useState('');
  const [isEndpointDropdownOpen, setIsEndpointDropdownOpen] = useState(false);
  const [endpointSearchQuery, setEndpointSearchQuery] = useState('');
  const [testModelStatus, setTestModelStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testModelMessage, setTestModelMessage] = useState('');
  
  const [addModelTestStatus, setAddModelTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [addModelTestMessage, setAddModelTestMessage] = useState('');
  const [showForceAddModal, setShowForceAddModal] = useState(false);
  const editAliasInputRef = useRef<HTMLInputElement>(null);

  // --- Model Discovery State ---
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const discoverAbortControllerRef = useRef<AbortController | null>(null);
  const testAllAbortControllerRef = useRef<AbortController | null>(null);
  const [addModelError, setAddModelError] = useState('');
  const [existingModelTestStatus, setExistingModelTestStatus] = useState<Record<string, { status: 'testing'|'success'|'error', message?: string }>>({}); 
  const [isTestingExisting, setIsTestingExisting] = useState(false);
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [showOnlyConnected, setShowOnlyConnected] = useState(false);
  const [individualTestStatus, setIndividualTestStatus] = useState<Record<string, { status: 'testing'|'success'|'error', message?: string }>>({});
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [modelDropdownMaxHeight, setModelDropdownMaxHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (isModelDropdownOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const availableSpace = window.innerHeight - (rect.top + 80) - 24;
      setModelDropdownMaxHeight(Math.max(200, availableSpace));
    }
  }, [isModelDropdownOpen]);

  // --- Endpoint Management State ---
  type EndpointConfig = { id: string; baseUrl: string; apiKey: string; api: string };
  const [endpoints, setEndpoints] = useState<EndpointConfig[]>([]);
  const [isEndpointModalOpen, setIsEndpointModalOpen] = useState(false);
  const [isAddModelModalOpen, setIsAddModelModalOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<EndpointConfig | null>(null);
  const [newEndpointData, setNewEndpointData] = useState<EndpointConfig>({ id: '', baseUrl: '', apiKey: '', api: 'openai-completions' });

  useEffect(() => {
    setTestResult(null);
  }, [url, token, password]);

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(data => {
        setUrl(data.gatewayUrl || '');
        setToken(data.token || '');
        setPassword(data.password || '');
        if (data.aiName) setAiName(data.aiName);
        if (data.loginEnabled !== undefined) setLoginEnabled(data.loginEnabled);
        if (data.loginPassword) setLoginPassword(data.loginPassword);
        if (data.allowedHosts) setAllowedHosts(data.allowedHosts);
        if (data.openclawWorkspace) setOpenclawWorkspace(data.openclawWorkspace);
      })
      .catch(console.error);

    fetchCommands();
    fetchModels();
    fetchEndpoints();

    fetch('/api/config/max-permissions')
      .then(r => r.json())
      .then(data => setMaxPermissions(!!data.enabled))
      .catch(console.error);
  }, []);

  const fetchModels = async () => {
    try {
      const res = await fetch('/api/models');
      const data = await res.json();
      if (data.success) {
        setModels(data.models || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchEndpoints = async () => {
    try {
      const res = await fetch('/api/endpoints');
      const data = await res.json();
      if (data.success) {
        setEndpoints(data.endpoints || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCommands = async () => {
    try {
      const res = await fetch('/api/commands');
      const data = await res.json();
      if (data.success) setCommands(data.commands);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDiscoverModels = async (endpointId: string) => {
    if (!endpointId) return;
    
    // Abort any ongoing fetch
    if (discoverAbortControllerRef.current) {
      discoverAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    discoverAbortControllerRef.current = controller;

    setIsDiscovering(true);
    setHasFetched(false);
    setDiscoveredModels([]);
    setModelSearchQuery('');
    setIndividualTestStatus({});
    setIsModelDropdownOpen(false); // keep closed until results are back

    try {
      const res = await fetch(`/api/models/discover?endpoint=${encodeURIComponent(endpointId)}`, {
        signal: controller.signal
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setDiscoveredModels(data.models || []);
        setHasFetched(true);
        if ((data.models || []).length > 0) {
          setIsModelDropdownOpen(true);
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Discovery aborted');
      } else {
        console.error(err);
      }
    } finally {
      if (discoverAbortControllerRef.current === controller) {
        setIsDiscovering(false);
        discoverAbortControllerRef.current = null;
      }
    }
  };

  const cancelDiscovery = () => {
    if (discoverAbortControllerRef.current) {
      discoverAbortControllerRef.current.abort();
      discoverAbortControllerRef.current = null;
      setIsDiscovering(false);
    }
  };

  const handleTestSingleModel = async (modelId: string, e?: React.MouseEvent, signal?: AbortSignal) => {
    if (e) e.stopPropagation();
    setIndividualTestStatus(prev => ({...prev, [modelId]: { status: 'testing', message: '' }}));
    try {
      const res = await fetch('/api/models/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: newModelEndpoint.trim(), modelName: modelId }),
        signal
      });
      const data = await res.json().catch(() => ({}));
      if (data.success) {
        setIndividualTestStatus(prev => ({...prev, [modelId]: { status: 'success', message: 'OK' }}));
      } else {
        setIndividualTestStatus(prev => ({...prev, [modelId]: { status: 'error', message: data.error || '失败' }}));
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Just clear the testing state if aborted, don't show an error
        setIndividualTestStatus(prev => {
          const next = { ...prev };
          delete next[modelId];
          return next;
        });
      } else {
        setIndividualTestStatus(prev => ({...prev, [modelId]: { status: 'error', message: '网络错误' }}));
      }
    }
  };

  const handleTestExistingSingleModel = async (fullModelId: string, endpoint: string, modelName: string) => {
    setExistingModelTestStatus(prev => ({ ...prev, [fullModelId]: { status: 'testing' } }));
    try {
      const res = await fetch('/api/models/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, modelName })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setExistingModelTestStatus(prev => ({ ...prev, [fullModelId]: { status: 'success' } }));
      } else {
        setExistingModelTestStatus(prev => ({ ...prev, [fullModelId]: { status: 'error', message: data.error || '连通性测试失败' } }));
      }
    } catch (err: any) {
      setExistingModelTestStatus(prev => ({ ...prev, [fullModelId]: { status: 'error', message: '网络错误' } }));
    }
  };

  const existingModelIds = new Set(models.map(m => m.id));

  const handleTestAllFiltered = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    if (testAllAbortControllerRef.current) {
      testAllAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    testAllAbortControllerRef.current = controller;

    const filtered = discoveredModels.filter(m => m.toLowerCase().includes(modelSearchQuery.toLowerCase()));
    const testPromises = filtered.map(async (m) => {
      if (existingModelIds.has(`${newModelEndpoint.trim()}/${m}`)) return;
      await handleTestSingleModel(m, undefined, controller.signal);
    });

    try {
      await Promise.all(testPromises);
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        setAddModelError(error.message || '批量测试部分失败');
      }
    } finally {
      if (testAllAbortControllerRef.current === controller) {
        testAllAbortControllerRef.current = null;
      }
    }
  };

  const cancelTestAll = () => {
    if (testAllAbortControllerRef.current) {
      testAllAbortControllerRef.current.abort();
      testAllAbortControllerRef.current = null;
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    setGatewayError(false);
    if (!url.trim()) {
      alert('网关地址不能为空');
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gatewayUrl: url, token, password, openclawWorkspace }),
      });
      if (res.ok) {
        setGatewaySaved(true);
        setTimeout(() => setGatewaySaved(false), 2000);
      } else throw new Error('保存失败');
    } catch (err) {
      setGatewayError(true);
      setTimeout(() => setGatewayError(false), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDetectAll = async () => {
    setIsDetectingAll(true);
    setDetectError('');
    try {
      const res = await fetch('/api/config/detect-all');
      const data = await res.json();
      if (data.success && data.data) {
        if (data.data.gatewayUrl) setUrl(data.data.gatewayUrl);
        if (data.data.token) setToken(data.data.token);
        if (data.data.password) setPassword(data.data.password);
        if (data.data.workspacePath) setOpenclawWorkspace(data.data.workspacePath);
      } else {
        setDetectError(data.message || '检测失败，请检查 OpenClaw 是否已正确安装或启动');
      }
    } catch (err) {
      console.error(err);
      setDetectError('检测请求发生网络错误');
    } finally {
      setIsDetectingAll(false);
    }
  };

  const handleRestartGateway = async () => {
    setIsRestarting(true);
    setRestartSuccess(false);
    try {
      const res = await fetch('/api/config/restart', { method: 'POST' });
      if (res.ok) {
        setRestartSuccess(true);
        setTimeout(() => setRestartSuccess(false), 3000);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || '重启网关失败');
      }
    } catch (err) {
      console.error(err);
      alert('重启请求发生网络错误');
    } finally {
      setIsRestarting(false);
    }
  };

  const handleAddHost = async () => {
    if (!newHost.trim()) return;
    const updated = [...allowedHosts, newHost.trim()];
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedHosts: updated }),
      });
      if (res.ok) {
        setAllowedHosts(updated);
        setNewHost('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateHost = async () => {
    if (!newHost.trim() || !editingHost) return;
    const updated = allowedHosts.map(h => h === editingHost ? newHost.trim() : h);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedHosts: updated }),
      });
      if (res.ok) {
        setAllowedHosts(updated);
        setEditingHost(null);
        setNewHost('');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const startEditHost = (host: string) => {
    setEditingHost(host);
    setNewHost(host);
  };

  const handleRemoveHost = (hostToRemove: string) => {
    setDeleteTarget({ type: 'host', value: hostToRemove });
    setDeleteModalMessage(`确定要删除域名 "${hostToRemove}" 吗？删除后该域名将立即失去访问权限。`);
    setIsDeleteModalOpen(true);
  };

  const handleTest = async () => {
    setIsLoading(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gatewayUrl: url, token, password }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ success: false, message: '测试连接失败' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveGeneral = async () => {
    setIsLoading(true);
    setGeneralError(false);
    if (!aiName.trim()) {
      setAiNameError('AI 名称不能为空');
      setIsLoading(false);
      return;
    }
    if (getVisualLength(aiName) > 20) {
      setAiNameError('AI 名称过长 (最多10个汉字或20个英文字符)');
      setIsLoading(false);
      return;
    }
    setAiNameError('');

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aiName, loginEnabled, loginPassword }),
      });
      if (res.ok) {
        setGeneralSaved(true);
        setTimeout(() => setGeneralSaved(false), 2000);
      } else throw new Error('保存失败');
    } catch (err) {
      setGeneralError(true);
      setTimeout(() => setGeneralError(false), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddCommand = async () => {
    if (!newCommand || !newDescription) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: newCommand, description: newDescription }),
      });
      if (res.ok) {
        setNewCommand('');
        setNewDescription('');
        fetchCommands();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateCommand = async () => {
    if (!editingId || !newCommand || !newDescription) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/commands/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: newCommand, description: newDescription }),
      });
      if (res.ok) {
        setEditingId(null);
        setNewCommand('');
        setNewDescription('');
        fetchCommands();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCommand = (id: number) => {
    setDeleteTarget({ type: 'command', id });
    setDeleteModalMessage('确定要删除此快捷指令吗？此操作不可恢复。');
    setIsDeleteModalOpen(true);
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === 'host') {
        const updated = allowedHosts.filter(h => h !== deleteTarget.value);
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ allowedHosts: updated }),
        });
        if (res.ok) setAllowedHosts(updated);
      } else if (deleteTarget.type === 'command') {
        const res = await fetch(`/api/commands/${deleteTarget.id}`, { method: 'DELETE' });
        if (res.ok) fetchCommands();
      } else if (deleteTarget.type === 'model') {
        const res = await fetch('/api/models/manage', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: deleteTarget.id }),
        });
        if (res.ok) {
          fetchModels();
  
        } else {
          const data = await res.json().catch(() => ({}));
          setModelError(data.error || '删除模型失败');
          setTimeout(() => setModelError(''), 3000);
        }
      } else if (deleteTarget.type === 'endpoint') {
        const res = await fetch('/api/endpoints/manage', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: deleteTarget.name }),
        });
        if (res.ok) {
          fetchModels();
          fetchEndpoints();
  
        } else {
          const data = await res.json().catch(() => ({}));
          setModelError(data.error || '删除端点失败');
          setTimeout(() => setModelError(''), 3000);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
    }
  };

  const startEdit = (cmd: { id: number; command: string; description: string }) => {
    setEditingId(cmd.id);
    setNewCommand(cmd.command);
    setNewDescription(cmd.description);
  };

  const handleTestModel = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!newModelEndpoint.trim() || !newModelName.trim()) {
      setAddModelError('端点和模型名称不能为空以进行检测');
      setTimeout(() => setAddModelError(''), 3000);
      return false;
    }
    setAddModelTestStatus('testing');
    setAddModelTestMessage('正在检测模型连通性...');
    try {
      const res = await fetch('/api/models/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: newModelEndpoint.trim(),
          modelName: newModelName.trim()
        })
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setAddModelTestStatus('success');
        setAddModelTestMessage(`模型连通性良好 (${data.latency}ms)`);
        return true;
      } else {
        setAddModelTestStatus('error');
        setAddModelTestMessage(data.error || '连通性测试失败');
        return false;
      }
    } catch (err: any) {
      setTestModelStatus('error');
      setTestModelMessage('检测过程发生网络错误');
      return false;
    }
  };

  const handleAddModel = async () => {
    if (!newModelEndpoint.trim() || !newModelName.trim()) {
      setAddModelError('端点和模型名称不能为空');
      setTimeout(() => setAddModelError(''), 3000);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/models/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: newModelEndpoint.trim(),
          modelName: newModelName.trim(),
          alias: newModelAlias.trim() || undefined
        }),
      });
      
      if (res.ok) {
        setNewModelEndpoint('');
        setNewModelName('');
        setNewModelAlias('');
        setIsAddModelModalOpen(false);
        fetchModels();
      } else {
        const data = await res.json().catch(() => ({}));
        setModelError(data.error || '保存模型失败');
        setTimeout(() => setModelError(''), 3000);
      }
    } catch (err) {
      console.error(err);
      setModelError('添加模型发生网络错误');
      setTimeout(() => setModelError(''), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteModel = (id: string, isPrimary: boolean) => {
    setDeleteTarget({ type: 'model', id });
    setDeleteModalMessage(
      `确定要删除模型 "${id}" 吗？\n${isPrimary ? '注意：这是当前的默认模型！\n' : ''}如果该模型已被智能体使用，它们将自动恢复为默认模型。`
    );
    setIsDeleteModalOpen(true);
  };

  const handleSetDefaultModel = async (id: string) => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/models/manage/default', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        fetchModels();

      } else {
        const data = await res.json().catch(() => ({}));
        setModelError(data.error || '设置默认模型失败');
        setTimeout(() => setModelError(''), 3000);
      }
    } catch (err) {
      console.error(err);
      setModelError('设置默认模型发生网络错误');
      setTimeout(() => setModelError(''), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const startEditModel = (model: { id: string; alias?: string }) => {
    setEditingModelId(model.id);
    setEditingAlias(model.alias || '');
    setTimeout(() => editAliasInputRef.current?.focus(), 50);
  };

  const handleDeleteEndpoint = (endpoint: string, count: number) => {
    setDeleteTarget({ type: 'endpoint', name: endpoint });
    setDeleteModalMessage(`确定要删除端点 "${endpoint}" 吗？\n这将删除该端点下的全部 ${count} 个模型。\n如果其中包含默认模型或被智能体使用的模型，将自动恢复为系统默认。`);
    setIsDeleteModalOpen(true);
  };

  const cancelEditModel = () => {
    setEditingModelId(null);
    setEditingAlias('');
  };

  const handleSaveModelAlias = async () => {
    if (!editingModelId) return;
    setIsLoading(true);
    try {
      const res = await fetch('/api/models/manage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingModelId, alias: editingAlias }),
      });
      if (res.ok) {
        setEditingModelId(null);
        setEditingAlias('');
        fetchModels();

      } else {
        const data = await res.json().catch(() => ({}));
        setModelError(data.error || '修改别名失败');
        setTimeout(() => setModelError(''), 3000);
      }
    } catch (err) {
      console.error(err);
      setModelError('修改别名发生网络错误');
      setTimeout(() => setModelError(''), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const openAddEndpointModal = () => {
    setEditingEndpoint(null);
    setNewEndpointData({ id: '', baseUrl: '', apiKey: '', api: 'openai-completions' });
    setIsEndpointModalOpen(true);
  };

  const openEditEndpointModal = (ep: EndpointConfig) => {
    setEditingEndpoint(ep);
    setNewEndpointData({ ...ep });
    setIsEndpointModalOpen(true);
  };

  const handleSaveEndpoint = async () => {
    if (!newEndpointData.id.trim() || !newEndpointData.baseUrl.trim() || !newEndpointData.api) {
      setModelError('端点名称、URL和接口类型不能为空');
      setTimeout(() => setModelError(''), 3000);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/endpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEndpointData),
      });
      if (res.ok) {
        setIsEndpointModalOpen(false);
        fetchEndpoints();

      } else {
        const data = await res.json().catch(() => ({}));
        setModelError(data.error || '保存端点失败');
        setTimeout(() => setModelError(''), 3000);
      }
    } catch (err) {
      console.error(err);
      setModelError('保存端点发生网络错误');
      setTimeout(() => setModelError(''), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  // Get distinct endpoints from current models, merged with actual endpoints objects
  const knownEndpoints = Array.from(new Set([
    ...endpoints.map(ep => ep.id),
    ...models.map(m => m.id.split('/')[0]).filter(Boolean)
  ])).sort((a, b) => a.localeCompare(b));

  const activeSettingsTab = settingsTab === 'commands' ? 'commands' : 'general';
  const headerTitle = activeSettingsTab === 'commands' ? '设置 - 快捷指令' : '设置 - 通用';

  return (
    <div className="flex flex-col h-full bg-gray-50/50">
      <header className="h-14 flex items-center px-4 sm:px-8 border-b border-gray-300 bg-white sticky top-0 z-10 gap-3">
        <button 
          className="md:hidden text-gray-500 hover:text-gray-900 focus:outline-none pr-1"
          onClick={onMenuClick}
        >
          <Menu className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold text-gray-900">{headerTitle}</h2>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:p-8">
        <div className="max-w-2xl mx-auto space-y-6 sm:space-y-8">

          {/* Gateway Settings Tab */}
          {false && (
            <>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-lg font-semibold text-gray-900">连接设置</h3>
                  <div className="flex flex-col items-end gap-1 relative">
                    <button
                      type="button"
                      onClick={handleDetectAll}
                      disabled={isDetectingAll || isLoading}
                      className="flex shrink-0 items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-all text-sm font-medium disabled:opacity-50"
                    >
                      {isDetectingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                      自动检测
                    </button>
                    {detectError && (
                      <div className="absolute top-full mt-2 right-0 w-80 text-xs bg-red-50 text-red-600 border border-red-200 p-2 rounded-lg shadow-sm z-10 break-words pointer-events-none">
                        {detectError}
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-500 mb-6 mt-1">配置连接到 OpenClaw 网关的终结点和凭据。</p>
                
                <div className="space-y-5 sm:space-y-6 bg-white p-4 sm:p-6 rounded-2xl border border-gray-200">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      网关地址 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="ws://127.0.0.1:18789"
                      className="block w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">Token</label>
                    <input
                      type="text"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      className="block w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">密码</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="block w-full px-4 py-2.5 pr-12 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 px-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* OpenClaw Workspace Path */}
                  <div className="border-t border-gray-100 pt-5">
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                       OpenClaw 工作区路径
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={openclawWorkspace}
                        onChange={(e) => setOpenclawWorkspace(e.target.value)}
                        placeholder="/root/.openclaw/workspace-main"
                        className="block w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm font-mono"
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">
                      配置此项后，上传的文件将存入该路径，以便 OpenClaw 识别。
                    </p>
                  </div>
                </div>

                {/* Max Permissions Toggle */}
                <div className="mt-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">权限设置</h3>
                  <p className="text-sm text-gray-500 mb-4">控制 OpenClaw 网关的工具权限级别。</p>

                  <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 pr-4">
                        <div className="text-sm font-medium text-gray-900">最大化权限</div>
                        <p className="text-xs text-gray-400 mt-1">
                          开启后将解锁浏览器自动化、命令执行（免确认）、文件操作等全部工具权限。关闭则使用默认 coding 预设。
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={maxPermissions}
                        disabled={isTogglingPermissions}
                        onClick={async () => {
                          setIsTogglingPermissions(true);
                          try {
                            const res = await fetch('/api/config/max-permissions', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ enabled: !maxPermissions }),
                            });
                            const data = await res.json();
                            if (data.success) setMaxPermissions(data.enabled);
                          } catch (err) {
                            console.error(err);
                          } finally {
                            setIsTogglingPermissions(false);
                          }
                        }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 ${
                          maxPermissions ? 'bg-blue-600' : 'bg-gray-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${
                            maxPermissions ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Domain Management Section */}
                <div className="mt-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">域名管理</h3>
                  <p className="text-sm text-gray-500 mb-4">管理允许访问此网页的域名（用于反向代理安全白名单）。</p>
                  
                  <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-200 space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="text"
                        value={newHost}
                        onChange={(e) => setNewHost(e.target.value)}
                        placeholder="例如: openclaw.abc.com"
                        className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm font-mono"
                      />
                      <button
                        onClick={editingHost ? handleUpdateHost : handleAddHost}
                        disabled={!newHost.trim()}
                        className="px-6 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {editingHost ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        {editingHost ? '保存' : '添加'}
                      </button>
                      {editingHost && (
                        <button
                          onClick={() => { setEditingHost(null); setNewHost(''); }}
                          className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all font-bold text-sm"
                        >
                          取消
                        </button>
                      )}
                    </div>

                    <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                       {allowedHosts.map(host => (
                         <div key={host} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100 group">
                           <span className="text-sm font-mono text-gray-700">{host}</span>
                           <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                             <button 
                               onClick={() => startEditHost(host)}
                               className="p-1 px-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                               title="编辑"
                             >
                               <Edit2 className="w-4 h-4" />
                             </button>
                             <button 
                               onClick={() => handleRemoveHost(host)}
                               className="p-1 px-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                               title="删除"
                             >
                               <Trash2 className="w-4 h-4" />
                             </button>
                           </div>
                         </div>
                       ))}
                       {allowedHosts.length === 0 && (
                         <div className="text-center py-6 text-gray-400 text-sm italic">
                           暂无添加的域名
                         </div>
                       )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-center justify-between pt-4 gap-4 sm:gap-0">
                <div className="flex items-center gap-4 w-full sm:w-auto justify-center sm:justify-start">
                  <button
                    onClick={handleTest}
                    disabled={isLoading}
                    className="inline-flex items-center px-5 py-2.5 border border-gray-200 text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 transition-all disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : '测试连接'}
                  </button>
                  
                  {testResult && (
                    <div className={`flex items-center gap-2 text-sm ${testResult?.success ? 'text-green-600' : 'text-red-500'} animate-in fade-in zoom-in-95 duration-200`}>
                      {testResult?.success ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                      <span className="font-semibold">{testResult?.success ? '测试连接成功' : (testResult?.message === '测试连接失败' ? '测试连接失败' : `测试连接失败: ${testResult?.message}`)}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap sm:flex-nowrap gap-3 items-center w-full sm:w-auto justify-center sm:justify-end">
                  <button
                    onClick={handleRestartGateway}
                    disabled={!testResult?.success || isRestarting}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-xl transition-all ${
                      testResult?.success 
                        ? 'text-orange-600 bg-orange-50 hover:bg-orange-100 border border-orange-200' 
                        : 'text-gray-400 bg-gray-100 border border-gray-200 cursor-not-allowed'
                    }`}
                  >
                    {isRestarting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Loader2 className="w-4 h-4" />}
                    {restartSuccess ? '已重连' : '重启网关'}
                  </button>

                  <div className="h-6 w-px bg-gray-200 mx-1"></div>
                  {gatewayError && (
                    <span className="text-sm font-semibold text-red-500 animate-in fade-in zoom-in-95 duration-200 flex items-center gap-1">
                      <X className="w-4 h-4" /> 保存出错
                    </span>
                  )}
                  <button
                    onClick={handleSave}
                    disabled={isLoading || !testResult?.success}
                    className={`inline-flex items-center gap-2 px-6 sm:px-8 py-2.5 text-sm font-medium rounded-xl text-white transition-all ${
                      isLoading || !testResult?.success
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700'
                    }`}
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : gatewaySaved ? <><Check className="w-4 h-4" /> 已保存</> : '保存设置'}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* General Settings Tab */}
          {activeSettingsTab === 'general' && (
            <>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">通用设置</h3>
                <p className="text-sm text-gray-500 mb-6">配置 AI 助手的基本信息和系统安全选项。</p>

                <div className="space-y-6 bg-white p-6 rounded-2xl border border-gray-200">
                  {/* AI Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-2">
                      AI 名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={aiName}
                      onChange={(e) => {
                        setAiName(e.target.value);
                        if (aiNameError) setAiNameError('');
                      }}
                      placeholder="我的小龙虾"
                      className={`block w-full px-4 py-2.5 rounded-xl border ${aiNameError ? 'border-red-500' : 'border-gray-200'} bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 ${aiNameError ? 'focus:ring-red-500/20' : 'focus:ring-blue-500/20'} transition-all text-sm`}
                    />
                    {aiNameError ? (
                      <p className="text-xs text-red-500 mt-1.5 font-medium">{aiNameError}</p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-1.5">AI 在对话中显示的名称，限制10个汉字（20个英文字符）</p>
                    )}
                  </div>

                  {/* Login Password Toggle */}
                  <div className="border-t border-gray-100 pt-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-900">登录密码保护</label>
                        <p className="text-xs text-gray-400 mt-0.5">开启后，访问网页需要输入登录密码</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLoginEnabled(!loginEnabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                          loginEnabled ? 'bg-blue-600' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                            loginEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {loginEnabled && (
                      <div className="mt-3 animate-in slide-in-from-top-2 duration-200">
                        <label className="block text-sm font-medium text-gray-900 mb-2">登录密码</label>
                        <div className="relative">
                          <input
                            type={showLoginPassword ? "text" : "password"}
                            value={loginPassword}
                            onChange={(e) => setLoginPassword(e.target.value)}
                            placeholder="请输入登录密码"
                            className="block w-full px-4 py-2.5 pr-12 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
                          />
                          <button
                            type="button"
                            onClick={() => setShowLoginPassword(!showLoginPassword)}
                            className="absolute inset-y-0 right-0 px-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                          >
                            {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <p className="text-xs text-gray-400 mt-1.5">默认密码为 123456</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center sm:justify-end pt-4">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  {generalError && (
                    <span className="text-sm font-semibold text-red-500 animate-in fade-in zoom-in-95 duration-200 flex items-center gap-1">
                      <X className="w-4 h-4" /> 保存出错
                    </span>
                  )}
                  <button
                    onClick={handleSaveGeneral}
                    disabled={isLoading}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-2.5 text-sm font-medium rounded-xl text-white bg-blue-600 hover:bg-blue-700 transition-all disabled:opacity-50"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : generalSaved ? <><Check className="w-4 h-4" /> 已保存</> : '保存设置'}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Quick Commands Management Tab */}
          {activeSettingsTab === 'commands' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">快捷指令</h3>
                <p className="text-sm text-gray-500 mb-6">管理聊天框中可用的快捷指令。</p>

                {/* Add/Edit Form */}
                <div className="bg-white p-4 sm:p-6 rounded-2xl border border-gray-200 mb-6">
                  <div className="flex flex-col sm:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                      <label className="block text-sm font-medium text-gray-900 mb-2">指令 (需以 / 开头)</label>
                      <input
                        type="text"
                        value={newCommand}
                        onChange={(e) => setNewCommand(e.target.value)}
                        placeholder="/models"
                        className="block w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm font-mono"
                      />
                    </div>
                    <div className="flex-[2] w-full">
                      <label className="block text-sm font-medium text-gray-900 mb-2">说明</label>
                      <input
                        type="text"
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        placeholder="列出所有可用的模型"
                        className="block w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
                      />
                    </div>
                    <div className="flex w-full sm:w-auto gap-2">
                      <button
                        onClick={editingId ? handleUpdateCommand : handleAddCommand}
                        disabled={isLoading || !newCommand || !newDescription}
                        className="h-[42px] px-6 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-all disabled:opacity-50 flex-1 sm:flex-none flex items-center justify-center gap-2"
                      >
                        {editingId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        {editingId ? '保存' : '新增'}
                      </button>
                      {editingId && (
                        <button
                          onClick={() => { setEditingId(null); setNewCommand(''); setNewDescription(''); }}
                          className="h-[42px] px-4 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all font-bold text-sm flex-1 sm:flex-none"
                        >
                          取消
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Commands List */}
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[500px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest w-1/3">指令</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">说明</th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right w-24">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {commands.map((cmd) => (
                        <tr key={cmd.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 text-sm font-mono font-bold text-blue-600">{cmd.command}</td>
                          <td className="px-6 py-4 text-sm text-gray-600">{cmd.description}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button 
                                onClick={() => startEdit(cmd)}
                                className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                                title="编辑"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDeleteCommand(cmd.id)}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                title="删除"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {commands.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-6 py-12 text-center text-gray-400 text-sm italic">
                            暂无快捷指令
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Model Management Tab */}
          {false && (
            <div className="space-y-6">
              {/* Sub-tabs for Model Management */}
              <div className="flex bg-white rounded-xl border border-gray-200 p-1 mb-6">
                <button
                  onClick={() => setActiveModelSubTab('endpoints')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all ${
                    activeModelSubTab === 'endpoints'
                      ? 'bg-blue-50 text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  端点管理
                </button>
                <button
                  onClick={() => setActiveModelSubTab('models')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-lg transition-all ${
                    activeModelSubTab === 'models'
                      ? 'bg-blue-50 text-blue-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  模型管理
                </button>
              </div>

              {activeModelSubTab === 'models' && (
                <div>
                  <div className="flex justify-between items-start sm:items-center mb-6">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">模型管理</h3>
                      <p className="text-sm text-gray-500">管理可用的 AI 模型，支持多提供商。</p>
                    </div>
                    <button
                      onClick={() => {
                          setNewModelEndpoint('');
                          setNewModelName('');
                          setNewModelAlias('');
                          setAddModelTestStatus('idle');
                          setTestModelMessage('');
                          setDiscoveredModels([]);
                          setModelSearchQuery('');
                          setIndividualTestStatus({});
                          setShowOnlyConnected(false);
                          setModelError('');
                          setAddModelError('');
                          setIsAddModelModalOpen(true);
                      }}
                      className="h-[40px] px-5 rounded-xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-all flex items-center gap-1.5 shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      添加模型
                    </button>
                  </div>
                  
                  {modelError && (
                    <div className="mb-4 p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 flex items-center gap-2">
                      <X className="w-4 h-4 shrink-0" />
                      {modelError}
                    </div>
                  )}

                  {testModelStatus !== 'idle' && (
                    <div className={`mb-4 p-3 text-sm rounded-xl border flex items-center gap-2 animate-in fade-in duration-300 ${
                      testModelStatus === 'testing' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                      testModelStatus === 'success' ? 'bg-green-50 text-green-600 border-green-100' :
                      'bg-red-50 text-red-600 border-red-100'
                    }`}>
                      {testModelStatus === 'testing' ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> :
                      testModelStatus === 'success' ? <Check className="w-4 h-4 shrink-0" /> :
                      <X className="w-4 h-4 shrink-0" />}
                      {testModelMessage}
                    </div>
                  )}
                </div>
              )}

              {activeModelSubTab === 'endpoints' && (
              <div>
                <div className="flex justify-between items-start sm:items-center mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">端点管理</h3>
                    <p className="text-sm text-gray-500">管理 API 服务提供商的连接设置，如 Base URL 和 API Key。</p>
                  </div>
                  <button
                    onClick={openAddEndpointModal}
                    className="h-[40px] px-5 rounded-xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-all flex items-center gap-1.5 shrink-0"
                  >
                    <Plus className="w-4 h-4" />
                    新增端点
                  </button>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
                  {knownEndpoints.length === 0 ? (
                    <div className="px-4 py-8 text-center text-gray-400 text-sm">暂无端点</div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap text-sm w-[40%]">端点名称</th>
                          <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap text-sm w-[20%]">接口类型</th>
                          <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap text-center text-sm w-[20%]">模型</th>
                          <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap text-center text-sm w-[20%]">操作</th>
                        </tr>
                      </thead>
                        {knownEndpoints.map(epName => {
                          const epCount = models.filter(m => m.id.startsWith(`${epName}/`)).length;
                          const epConfig = endpoints.find(e => e.id === epName) || { id: epName, baseUrl: '', apiKey: '', api: 'openai-completions' };
                          
                          // Convert api internal name to display name
                          const displayApi = epConfig.api === 'openai-completions' ? 'OpenAI' : 
                                             epConfig.api === 'anthropic-messages' ? 'Anthropic' :
                                             epConfig.api === 'google-genai' ? 'Gemini' : 
                                             epConfig.api === 'ollama' ? 'Ollama' : epConfig.api;

                          return (
                            <tbody key={epName} className="group border-b border-gray-100 last:border-b-0 bg-white hover:bg-gray-50/50 transition-colors text-base">
                              <tr>
                                <td className="px-4 pt-4 pb-1 align-bottom text-gray-700">
                                  {epName}
                                </td>
                                <td className="px-4 pt-4 pb-1 align-bottom">
                                  <span className="px-2 py-0.5 rounded-md bg-gray-100/80 border border-gray-200 text-gray-500 text-xs font-mono">
                                    {displayApi}
                                  </span>
                                </td>
                                <td className="px-4 py-4 align-middle text-gray-500 text-sm text-center" rowSpan={2}>
                                  {epCount} 个
                                </td>
                                <td className="px-4 py-4 align-middle text-center" rowSpan={2}>
                                  <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                    <button
                                      onClick={() => openEditEndpointModal(epConfig)}
                                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                      title="编辑端点"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteEndpoint(epName, epCount)}
                                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                      title="删除整个端点"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                              <tr>
                                <td colSpan={2} className="px-4 pb-4 pt-1 align-top text-gray-500 text-sm break-all max-w-[400px]">
                                  {epConfig.baseUrl || '-'}
                                </td>
                              </tr>
                            </tbody>
                          );
                        })}
                    </table>
                  )}
                </div>
              </div>
              )}

              {activeModelSubTab === 'models' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">现有模型</h3>
                    <p className="text-sm text-gray-500">按模型 ID 升序排列，悬停列可进行编辑别名、设为默认或删除操作。</p>
                  </div>
                  <button
                    onClick={async () => {
                      setIsTestingExisting(true);
                      setExistingModelTestStatus({});
                      const testPromises = models.map(async (model) => {
                        const slashIndex = model.id.indexOf('/');
                        if (slashIndex === -1) return;
                        const endpoint = model.id.substring(0, slashIndex);
                        const modelName = model.id.substring(slashIndex + 1);
                        setExistingModelTestStatus(prev => ({...prev, [model.id]: { status: 'testing' }}));
                        try {
                          const res = await fetch('/api/models/test', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ endpoint, modelName })
                          });
                          const data = await res.json().catch(() => ({}));
                          if (data.success) {
                            setExistingModelTestStatus(prev => ({...prev, [model.id]: { status: 'success' }}));
                          } else {
                            setExistingModelTestStatus(prev => ({...prev, [model.id]: { status: 'error', message: data.error || '检测失败' }}));
                          }
                        } catch (err: any) {
                          setExistingModelTestStatus(prev => ({...prev, [model.id]: { status: 'error', message: '网络错误' }}));
                        }
                      });
                      await Promise.all(testPromises);
                      setIsTestingExisting(false);
                    }}
                    disabled={isTestingExisting || models.length === 0}
                    className={`h-[36px] px-4 rounded-lg text-sm font-medium transition-all border flex items-center gap-1.5 shrink-0 ${
                      isTestingExisting || models.length === 0
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : 'text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border-indigo-200'
                    }`}
                  >
                    {isTestingExisting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    检测
                  </button>
                </div>
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap text-sm">模型 ID</th>
                        <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap text-sm">别名</th>
                        <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap w-24 text-sm">状态</th>
                        <th className="px-4 py-3 font-medium text-gray-500 whitespace-nowrap text-right w-32 text-sm">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {models.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                            暂无模型配置
                          </td>
                        </tr>
                      ) : (
                        [...models].sort((a, b) => a.id.localeCompare(b.id, undefined, { sensitivity: 'base' })).map((model) => (
                          <tr key={model.id} className={`hover:bg-gray-50/50 transition-colors text-base ${editingModelId === model.id ? 'bg-blue-50/30' : 'group'}`}>
                            <td className="px-4 py-4 text-gray-700">{model.id}</td>
                            <td className="px-4 py-3 text-gray-600">
                              {editingModelId === model.id ? (
                                <input
                                  ref={editAliasInputRef}
                                  type="text"
                                  value={editingAlias}
                                  onChange={(e) => setEditingAlias(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveModelAlias();
                                    if (e.key === 'Escape') cancelEditModel();
                                  }}
                                  placeholder="输入别名（可留空）"
                                  className="w-full px-2 py-1 text-sm border border-blue-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-400/30"
                                />
                              ) : (
                                model.alias || <span className="text-gray-300">-</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                {(() => {
                                  const testData = existingModelTestStatus[model.id];
                                  if (testData?.status === 'testing') return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
                                  if (testData?.status === 'success') return <Check className="w-4 h-4 text-green-500" />;
                                  if (testData?.status === 'error') return <span title={testData.message}><X className="w-4 h-4 text-red-500" /></span>;
                                  return null;
                                })()}
                                {model.primary ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                    默认
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {editingModelId === model.id ? (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={handleSaveModelAlias}
                                    disabled={isLoading}
                                    className="p-1.5 text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors"
                                    title="保存"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={cancelEditModel}
                                    className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                    title="取消"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => startEditModel(model)}
                                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                                    title="修改别名"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  {!model.primary && (
                                    <button
                                      onClick={() => handleSetDefaultModel(model.id)}
                                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                      title="设为默认"
                                    >
                                      <Check className="w-4 h-4" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      const [endpoint, ...nameParts] = model.id.split('/');
                                      const modelName = nameParts.join('/');
                                      handleTestExistingSingleModel(model.id, endpoint, modelName);
                                    }}
                                    disabled={existingModelTestStatus[model.id]?.status === 'testing' || isTestingExisting}
                                    className={`p-1.5 rounded-lg transition-colors ${
                                      existingModelTestStatus[model.id]?.status === 'testing' || isTestingExisting
                                        ? 'text-gray-300 cursor-not-allowed'
                                        : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50'
                                    }`}
                                    title="测试可用性"
                                  >
                                    <Activity className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteModel(model.id, model.primary)}
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="删除"
                                  >
                              <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                )}
              </div>
            )}

            {/* About System Tab */}

            {false && (
              <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <div className="bg-white rounded-3xl border border-gray-200 p-10 w-full max-w-lg text-center flex flex-col items-center">
                  
                  {/* Logo Section */}
                  <div className="mb-6 w-max text-center flex flex-col items-center">
                    <div className="text-[2.5rem] font-black text-[#1a1c1e] tracking-tight leading-tight mb-0.5">OpenClaw</div>
                    <div className="text-[1.1rem] font-bold text-[#94a3b8] tracking-[0.35em] uppercase leading-tight">CHAT GATEWAY</div>
                  </div>

                  {/* Version Info */}
                  <div className="space-y-4 mb-8">
                    <div className="text-2xl font-medium text-gray-800">Ver: 1.00</div>
                    <div>
                      <a href="#" className="text-[#3b82f6] hover:text-blue-700 font-medium text-lg transition-colors underline-offset-4 hover:underline">
                        检查新版本
                      </a>
                    </div>
                  </div>

                  {/* Author Info */}
                  <div className="text-xl font-medium text-gray-700 mb-10">
                    安格视界 / AnGeWorld
                  </div>

                  {/* Links Row */}
                  <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4 mb-6">
                    <a 
                      href="https://github.com/liandu2024/OpenClaw-Chat-Gateway" 
                      target="_blank" 
                      rel="noreferrer"
                      className="flex items-center gap-2 text-[#3b82f6] hover:text-blue-700 transition-colors group text-[13px] sm:text-[15px] font-medium"
                    >
                      <Github className="w-5 h-5 text-gray-900 group-hover:-translate-y-0.5 transition-transform" />
                      <span>Github</span>
                    </a>
                  <a 
                    href="https://t.me/angeworld2024" 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-2 text-[#3b82f6] hover:text-blue-700 transition-colors group text-[13px] sm:text-[15px] font-medium"
                  >
                    <Send className="w-5 h-5 text-[#3b82f6] group-hover:-translate-y-0.5 transition-transform" />
                    <span>安格视界TG群</span>
                  </a>
                  <a 
                    href="https://blog.angeworld.cc/market" 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center gap-2 text-[#3b82f6] hover:text-blue-700 transition-colors group text-[13px] sm:text-[15px] font-medium"
                  >
                    <ShoppingBag className="w-5 h-5 text-[#ef4444] group-hover:-translate-y-0.5 transition-transform" />
                    <span>安格超市</span>
                  </a>
                </div>

                {/* API Button Row */}
                <div className="w-full flex justify-center mb-8 px-2">
                  <a 
                    href="https://ai.opendoor.cn" 
                    target="_blank" 
                    rel="noreferrer"
                    className="flex items-center justify-center px-6 py-2.5 rounded-xl sm:rounded-full bg-[#fefce8] border border-blue-300 text-[#3b82f6] hover:bg-yellow-100 hover:border-blue-400 transition-all font-bold text-[11px] min-[380px]:text-[12px] sm:text-[14px] max-w-full text-center"
                  >
                    芝麻开门 AI 接口 : https://ai.opendoor.cn
                  </a>
                </div>

              </div>
            </div>
          )}

        </div>
      </div>

      {/* Shared Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setIsDeleteModalOpen(false)}></div>
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-sm overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-6 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">确认删除</h3>
              <p className="text-sm text-gray-500">{deleteModalMessage}</p>
            </div>
            <div className="p-4 bg-gray-50 flex gap-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="flex-1 px-4 py-2.5 text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-xl font-semibold transition-all"
              >
                取消
              </button>
              <button
                type="button"
                onClick={executeDelete}
                className="flex-1 px-4 py-2.5 text-white bg-red-600 hover:bg-red-700 rounded-xl font-semibold transition-all"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Endpoint Add/Edit Modal */}
      {isEndpointModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setIsEndpointModalOpen(false)}></div>
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md overflow-hidden relative z-10 animate-in fade-in zoom-in-95 duration-200 shadow-xl">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-900">
                {editingEndpoint ? '编辑端点设置' : '新增端点'}
              </h3>
              <button 
                onClick={() => setIsEndpointModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {modelError && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 flex items-center gap-2">
                  <X className="w-4 h-4 shrink-0" />
                  {modelError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">
                  端点名称 (ID) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newEndpointData.id}
                  onChange={(e) => setNewEndpointData({ ...newEndpointData, id: e.target.value })}
                  disabled={!!editingEndpoint}
                  placeholder="例如: openai, my-company"
                  className="block w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">
                  接口类型 <span className="text-red-500">*</span>
                </label>
                <select
                  value={newEndpointData.api}
                  onChange={(e) => setNewEndpointData({ ...newEndpointData, api: e.target.value })}
                  className="block w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
                >
                  <option value="openai-completions">OpenAI 兼容 (Chat Completions)</option>
                  <option value="anthropic-messages">Anthropic (Messages)</option>
                  <option value="google-genai">Google Gemini (GenAI)</option>
                  <option value="cohere-chat">Cohere Chat</option>
                  <option value="mistral-chat">Mistral Chat</option>
                  <option value="ollama">Ollama</option>
                </select>
                <p className="text-xs text-gray-500 mt-1.5 ml-1">取决于提供商的底层 API 格式，通常为 OpenAI 兼容。</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">
                  Base URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newEndpointData.baseUrl}
                  onChange={(e) => setNewEndpointData({ ...newEndpointData, baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  className="block w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1.5">
                  API Key
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={newEndpointData.apiKey}
                    onChange={(e) => setNewEndpointData({ ...newEndpointData, apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="block w-full px-4 py-2.5 pr-12 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 px-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="p-4 bg-gray-50 flex gap-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsEndpointModalOpen(false)}
                className="flex-[0.8] px-4 py-2.5 text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-xl font-semibold transition-all"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveEndpoint}
                disabled={isLoading}
                className="flex-[1.2] px-4 py-2.5 text-white bg-blue-600 hover:bg-blue-700 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                保存端点
              </button>
            </div>
          </div>
        </div>
      )}
      {/* End of content */}

      {isAddModelModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity" onClick={() => setIsAddModelModalOpen(false)}></div>
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-2xl min-h-[400px] overflow-visible relative z-10 animate-in fade-in zoom-in-95 duration-200 shadow-xl flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-start bg-gray-50/50 rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-gray-900 mt-1">添加模型</h3>
                <div className="text-xs text-gray-500 mt-1">
                  选择端点并选择模型 ID，注意：
                  <div className="text-red-500 font-bold mt-1 space-y-0.5 leading-relaxed">
                    <p>1）自动拉取模型不一定准确，可参考平台官方文档，手动输入模型ID添加。</p>
                    <p>2）检测模型，也会消耗 Token！</p>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setIsAddModelModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                title="关闭"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-5 flex-1 overflow-visible flex flex-col">
              {addModelError && (
                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100 flex items-center gap-2">
                  <X className="w-4 h-4 shrink-0" />
                  {addModelError}
                </div>
              )}
              {addModelTestStatus !== 'idle' && (
                <div className={`p-3 text-sm rounded-xl border flex items-center gap-2 animate-in fade-in duration-300 ${
                  addModelTestStatus === 'testing' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                  addModelTestStatus === 'success' ? 'bg-green-50 text-green-600 border-green-100' :
                  'bg-red-50 text-red-600 border-red-100'
                }`}>
                  {addModelTestStatus === 'testing' ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> :
                    addModelTestStatus === 'success' ? <Check className="w-4 h-4 shrink-0" /> :
                    <X className="w-4 h-4 shrink-0" />}
                  {addModelTestMessage}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 z-[210]">
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-900 mb-1.5">
                    所属端点 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={isEndpointDropdownOpen ? endpointSearchQuery : newModelEndpoint}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEndpointSearchQuery(val);
                        if (!isEndpointDropdownOpen) setIsEndpointDropdownOpen(true);
                      }}
                      onFocus={() => {
                        setEndpointSearchQuery('');
                        setIsEndpointDropdownOpen(true);
                      }}
                      placeholder={newModelEndpoint ? newModelEndpoint : "点击选择或输入端点"}
                      className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all text-sm font-mono text-gray-900 pr-8"
                    />
                    {newModelEndpoint && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNewModelEndpoint('');
                          setEndpointSearchQuery('');
                          setIsEndpointDropdownOpen(false);
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-all"
                        title="清除"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {isEndpointDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-[10]" onClick={() => {
                        setIsEndpointDropdownOpen(false);
                        if (endpointSearchQuery && !newModelEndpoint) {
                          setNewModelEndpoint(endpointSearchQuery.trim());
                          handleDiscoverModels(endpointSearchQuery.trim());
                        }
                      }} />
                      <div className="absolute z-[20] top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl max-h-[160px] overflow-y-auto shadow-lg">
                        {knownEndpoints
                          .filter(ep => {
                            if (!endpointSearchQuery) return true;
                            return ep.toLowerCase().includes(endpointSearchQuery.toLowerCase());
                          })
                          .map((ep, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                setNewModelEndpoint(ep);
                                setHasFetched(false);
                                setEndpointSearchQuery('');
                                setIsEndpointDropdownOpen(false);
                              }}
                              className={`w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors flex items-center gap-2 ${
                                newModelEndpoint === ep ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                              }`}
                            >
                              <span className="font-mono text-xs max-w-[200px] truncate">{ep}</span>
                            </button>
                          ))
                        }
                        {endpointSearchQuery && !knownEndpoints.some(ep => ep.toLowerCase() === endpointSearchQuery.toLowerCase()) && (
                          <button
                            type="button"
                            onClick={() => {
                              const val = endpointSearchQuery.trim();
                              setNewModelEndpoint(val);
                              setHasFetched(false);
                              setEndpointSearchQuery('');
                              setIsEndpointDropdownOpen(false);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-blue-600 hover:bg-blue-50 transition-colors border-t border-gray-100 bg-gray-50 flex items-center justify-between"
                          >
                            <span>使用新端点: <strong className="font-mono">{endpointSearchQuery}</strong></span>
                            <Plus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1.5">别名（可选）</label>
                  <input
                    type="text"
                    value={newModelAlias}
                    onChange={(e) => setNewModelAlias(e.target.value)}
                    placeholder="例如: GPT 4O"
                    className="block w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all text-sm"
                  />
                </div>
              </div>

              <div className="flex-1 flex flex-col relative z-10" ref={dropdownRef}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-medium text-gray-900">
                    模型 ID <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (isDiscovering) {
                        cancelDiscovery();
                      } else if (hasFetched && discoveredModels.length > 0) {
                        setHasFetched(false);
                      } else {
                        handleDiscoverModels(newModelEndpoint.trim());
                      }
                    }}
                    disabled={!newModelEndpoint.trim()}
                    title={isDiscovering ? "正在拉取模型，点击可取消。" : ""}
                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all border flex items-center gap-1.5 ${
                      !newModelEndpoint.trim()
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : isDiscovering
                        ? 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {isDiscovering && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {isDiscovering 
                      ? '自动拉取中...' 
                      : (hasFetched && discoveredModels.length > 0) 
                        ? '手动输入' 
                        : '自动拉取'
                    }
                  </button>
                </div>
                <div 
                  className="relative cursor-pointer block w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 focus-within:bg-white focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500/20 transition-all text-sm min-h-[46px] flex items-center gap-2 flex-wrap"
                  onClick={() => {
                    if (hasFetched && discoveredModels.length > 0) {
                      setIsModelDropdownOpen(true);
                    }
                  }}
                >
                  <input
                    type="text"
                    value={newModelName}
                    onChange={(e) => {
                      setNewModelName(e.target.value);
                      setModelSearchQuery(e.target.value);
                    }}
                    placeholder={!hasFetched ? '例如: gpt-4o (可点击上方连网拉取或手动输入)' : (discoveredModels.length > 0 ? `发现 ${discoveredModels.length} 个模型（点击或输入关键字过滤，也可以直接输入模型ID）` : '未拉取到模型，请手动输入')}
                    className="bg-transparent border-none outline-none w-full text-sm placeholder-gray-400 py-1"
                    onFocus={() => {
                      if (hasFetched && discoveredModels.length > 0) {
                        setIsModelDropdownOpen(true);
                      }
                    }}
                  />
                  {newModelName && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setNewModelName('');
                        setModelSearchQuery('');
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-all"
                      title="清除"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {isModelDropdownOpen && (hasFetched && discoveredModels.length > 0) && (
                  <>
                  <div className="fixed inset-0 z-[40]" onClick={(e) => { e.stopPropagation(); setIsModelDropdownOpen(false); }} />
                  <div 
                    className="absolute z-50 left-0 right-0 top-[80px] bg-white border border-gray-200 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
                    style={{ maxHeight: modelDropdownMaxHeight ? `${modelDropdownMaxHeight}px` : '350px' }}
                  >
                    {(() => {
                      const visibleDiscoveredModels = discoveredModels.filter(m => {
                        if (showOnlyConnected && individualTestStatus[m]?.status !== 'success') return false;
                        return m.toLowerCase().includes(modelSearchQuery.toLowerCase());
                      }).sort((a, b) => a.localeCompare(b));
                      const isAnyTesting = Object.values(individualTestStatus).some(t => t.status === 'testing');
                      const hasAnyTests = Object.keys(individualTestStatus).length > 0;

                      return (
                        <>
                          <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 bg-gray-50/95 backdrop-blur">
                            <span className="text-sm text-gray-700 font-semibold flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                              模型 ({visibleDiscoveredModels.length})
                            </span>
                            
                            <div className="flex items-center gap-3">
                              <div className="flex items-center bg-gray-200/50 p-0.5 rounded-lg border border-gray-200/50">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setShowOnlyConnected(false); }}
                                  disabled={isAnyTesting}
                                  className={`text-sm px-3 py-1.5 rounded-md font-medium transition-all border ${
                                    !showOnlyConnected
                                      ? 'bg-white text-gray-800 border-gray-200'
                                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                                  } ${isAnyTesting ? 'opacity-50 cursor-not-allowed' : ''}`}
                                >
                                  全部
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setShowOnlyConnected(true); }}
                                  disabled={isAnyTesting || !hasAnyTests}
                                  className={`text-sm px-3 py-1.5 rounded-md font-medium transition-all border ${
                                    showOnlyConnected
                                      ? 'bg-white text-green-700 border-green-200'
                                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                                  } ${(isAnyTesting || !hasAnyTests) ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  title={!hasAnyTests ? "尚未进行任何连通性检测" : ""}
                                >
                                  有效
                                </button>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isAnyTesting) {
                                    cancelTestAll();
                                  } else {
                                    handleTestAllFiltered();
                                  }
                                }}
                                disabled={!isAnyTesting && visibleDiscoveredModels.length === 0}
                                title={isAnyTesting ? "模型检测中，点击可取消检测" : ""}
                                className={`text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition-all border ${
                                  !isAnyTesting && visibleDiscoveredModels.length === 0
                                    ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                    : isAnyTesting
                                    ? 'text-red-600 bg-red-50 hover:bg-red-100 border-red-200'
                                    : 'text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border-indigo-200'
                                }`}
                              >
                                {isAnyTesting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                {isAnyTesting
                                  ? `检测中（${Object.values(individualTestStatus).filter(t => t.status === 'testing').length}）`
                                  : '检测'
                                }
                              </button>
                            </div>
                          </div>
                          
                          <div className="overflow-y-auto flex-1 p-1.5 space-y-0.5 min-h-[100px]" onClick={() => setIsModelDropdownOpen(false)}>
                            {visibleDiscoveredModels.length === 0 && (
                              <div className="py-8 text-center text-gray-400 text-sm">
                                {showOnlyConnected ? '没有找到检测成功的模型' : `未能找到匹配 "${modelSearchQuery}" 的模型`}
                              </div>
                            )}
                            {visibleDiscoveredModels.map(m => {
                              const isExisting = existingModelIds.has(`${newModelEndpoint.trim()}/${m}`);
                              const testData = individualTestStatus[m];
                              const isSelected = newModelName === m;

                              return (
                                <div 
                                  key={m}
                                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                                    isExisting ? 'opacity-60 bg-gray-50/50 cursor-not-allowed' :
                                    isSelected ? 'bg-blue-50/80 border-blue-100 font-medium cursor-pointer shadow-sm' : 'hover:bg-gray-100 cursor-pointer border-transparent'
                                  } border`}
                                  onClick={(e) => {
                                    if (isExisting) return;
                                    e.preventDefault();
                                    if (isSelected) {
                                      setNewModelName('');
                                    } else {
                                      setNewModelName(m);
                                      setIsModelDropdownOpen(false);
                                    }
                                  }}
                                >
                                  <div className="flex items-center gap-3 overflow-hidden flex-1">
                                    <span className={`truncate ${isSelected ? 'text-blue-900' : 'text-gray-700'}`} title={m}>{m}</span>
                                    {isExisting && <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full ml-1 shrink-0 font-medium">已在使用</span>}
                                  </div>

                                  {!isExisting && (
                                    <div className="flex items-center gap-2 shrink-0 ml-3" onClick={e => e.stopPropagation()}>
                                      {testData?.status === 'testing' && <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
                                      {testData?.status === 'success' && <span title="有效"><Check className="w-3.5 h-3.5 text-green-500" /></span>}
                                      {testData?.status === 'error' && <span title={testData.message}><X className="w-3.5 h-3.5 text-red-500" /></span>}
                                      
                                      <button 
                                        onClick={(e) => handleTestSingleModel(m, e)}
                                        className="text-xs text-gray-500 hover:text-indigo-600 px-2 py-1 border border-gray-200 rounded hover:bg-gray-50 transition-colors"
                                        title="独立检测此模型"
                                      >
                                        检测
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  </>
                )}
              </div>
            </div>

            <div className="p-5 bg-gray-50 flex gap-3 border-t border-gray-100 rounded-b-2xl justify-end">
              <button
                type="button"
                onClick={() => setIsAddModelModalOpen(false)}
                className="px-5 py-2.5 text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-xl font-semibold transition-all"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleTestModel}
                disabled={addModelTestStatus === 'testing' || !newModelEndpoint.trim() || !newModelName.trim()}
                className="px-5 py-2.5 text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-xl font-semibold transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {addModelTestStatus === 'testing' ? <Loader2 className="w-4 h-4 animate-spin" /> : '检测'}
              </button>
              <button
                type="button"
                onClick={() => handleAddModel()}
                disabled={isLoading || addModelTestStatus === 'testing' || !newModelEndpoint.trim() || !newModelName.trim()}
                className="px-6 py-2.5 text-white bg-blue-600 hover:bg-blue-700 rounded-xl font-semibold transition-all disabled:opacity-50 flex items-center gap-2 shadow-sm"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                添加
              </button>
            </div>
          </div>
        </div>
      )}
      {showForceAddModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-2">模型连通性检测失败</h3>
              <p className="text-sm text-gray-700 mb-6 bg-red-50 p-3 rounded-lg border border-red-100">{testModelMessage}</p>
              <p className="text-sm text-gray-600 mb-6">该模型似乎无法正确访问。确定要强行将其加入系统吗？</p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowForceAddModal(false)}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    setShowForceAddModal(false);
                    handleAddModel();
                  }}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-700 transition-colors cursor-pointer"
                >
                  强制添加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
