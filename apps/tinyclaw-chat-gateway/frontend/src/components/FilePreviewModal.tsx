import { useState, useEffect, useRef } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { getFileIconInfo } from '../utils/fileUtils';

// Configure pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

interface FilePreviewModalProps {
  url: string;
  filename: string;
  onClose: () => void;
}

type PreviewState = 
  | { status: 'loading' }
  | { status: 'ready'; type: 'image' | 'pdf' | 'html' | 'text' | 'code' | 'unsupported'; content?: string; pdfUrl?: string }
  | { status: 'error'; message: string };

// Cache capabilities result
let cachedCapabilities: { libreoffice: boolean } | null = null;

async function getCapabilities(): Promise<{ libreoffice: boolean }> {
  if (cachedCapabilities) return cachedCapabilities;
  try {
    const res = await fetch('/api/files/capabilities');
    cachedCapabilities = await res.json();
    return cachedCapabilities!;
  } catch {
    cachedCapabilities = { libreoffice: false };
    return cachedCapabilities;
  }
}

function getFileType(filename: string): string {
  const cleanName = filename.replace(/[\uff08（(].*$/, '').trim();
  const ext = cleanName.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx'].includes(ext)) return 'docx';
  if (['xls', 'xlsx'].includes(ext)) return 'xlsx';
  if (ext === 'csv') return 'csv';
  if (['ppt', 'pptx'].includes(ext)) return 'pptx';
  if (['txt', 'md', 'log', 'json', 'xml', 'yaml', 'yml', 'ini', 'cfg', 'conf'].includes(ext)) return 'text';
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'rb', 'php', 'html', 'css', 'scss', 'less', 'sql', 'sh', 'bash', 'zsh'].includes(ext)) return 'code';
  return 'unknown';
}

function extractPathParam(url: string): string | null {
  try {
    const match = url.match(/[?&]path=([^&]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// Zoomable Wrapper for mobile pinch-to-zoom using react-zoom-pan-pinch
function ZoomableWrapper({ children, center = false }: { children: React.ReactNode, center?: boolean }) {
  const [isZoomed, setIsZoomed] = useState(false);

  return (
    <div className={`w-full h-full flex flex-col ${center ? 'items-center justify-center' : 'items-start justify-start'} overflow-hidden`}>
      <TransformWrapper
        initialScale={1}
        minScale={1}
        maxScale={4}
        centerOnInit={center}
        centerZoomedOut={center}
        limitToBounds={false}
        wheel={{ step: 0.1, activationKeys: ["Control", "Meta"] }} // Require Ctrl/Cmd to zoom on PC to restore native mouse wheel scroll
        doubleClick={{ step: 0.5 }}
        panning={{ disabled: !isZoomed, velocityDisabled: true }} // Disable JS pan when unzoomed to restore native 1-finger scroll
        alignmentAnimation={{ animationTime: 200 }}
        onZoom={(ref) => setIsZoomed(ref.state.scale > 1)}
        onZoomStop={(ref) => {
          const zoomed = ref.state.scale > 1.05; // give a slight buffer for floating point
          setIsZoomed(zoomed);
          if (!zoomed) {
            // Snap back to exactly center (x=0, y=0) when fully zoomed out
            // This fixes the issue where panning off-axis leaves blank space 
            ref.resetTransform();
          }
        }}
        onInit={(ref) => setIsZoomed(ref.state.scale > 1)}
        // `TransformWrapper` renders a hidden dom element that wraps `TransformComponent`.
        // By default it grows to `max-content`. Adding basic dimension constraint via CSS.
      >
        <TransformComponent 
          wrapperStyle={{ 
            width: '100%', 
            height: '100%', 
            // Crucial fix: DO NOT toggle overflow dynamically. 
            // It causes massive React re-renders and reflows during touch events,
            // resulting in lag, Android tearing, and iOS Safari crashes.
            overflowY: 'auto',
            overflowX: 'hidden',
            touchAction: isZoomed ? 'none' : 'pan-y' // Tell browser to natively allow vertical scroll or block it
          }} 
          contentStyle={{ 
            width: '100%', 
            minHeight: '100%', 
            display: center ? 'flex' : 'block',
            alignItems: center ? 'center' : 'flex-start',
            justifyContent: center ? 'center' : 'flex-start',
            willChange: isZoomed ? 'transform' : 'auto' 
          }}
        >
          {children}
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}

// PDF Canvas Viewer — renders each page as a canvas (works on mobile)
function PdfCanvasViewer({ pdfUrl }: { pdfUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const loadPdf = async () => {
      try {
        setLoading(true);
        setError('');
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        if (cancelled) return;
        setPageCount(pdf.numPages);

        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';

        const containerWidth = container.clientWidth - 32; // account for padding

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          if (cancelled) return;

          const baseViewport = page.getViewport({ scale: 1 });
          const dpr = window.devicePixelRatio || 1;
          const fitScale = containerWidth / baseViewport.width;
          
          const isMobile = window.innerWidth <= 768;
          // Drastically cap render scale on mobile to prevent iOS Safari memory crashes (canvas limits)
          // 1.5x gives decent text clarity without blowing the RAM budget per page
          const renderScale = fitScale * (isMobile ? Math.min(dpr, 1.5) : dpr * 2);
          
          const viewport = page.getViewport({ scale: renderScale });

          const canvas = document.createElement('canvas');
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          canvas.style.width = '100%'; // Let it scale to container
          canvas.style.height = 'auto';
          canvas.style.display = 'block';
          if (i > 1) {
            canvas.style.marginTop = '8px';
            canvas.style.borderTop = '1px solid #e5e7eb';
            canvas.style.paddingTop = '8px';
          }

          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport, canvas }).promise;
          }
          if (cancelled) return;
          container.appendChild(canvas);
        }
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || '无法加载 PDF');
          setLoading(false);
        }
      }
    };
    loadPdf();
    return () => { cancelled = true; };
  }, [pdfUrl]);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 bg-white p-8 rounded-2xl max-w-md text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center">
          <X className="w-8 h-8 text-red-500" />
        </div>
        <p className="text-sm font-medium text-gray-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl mx-auto bg-white sm:rounded-2xl sm:border border-gray-200 relative shadow-sm min-h-[400px]">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
          <div className="flex flex-col items-center gap-3 text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            <span className="text-sm font-medium">正在渲染文档...</span>
          </div>
        </div>
      )}
      <div ref={containerRef} className="p-4" />
      {!loading && pageCount > 0 && (
        <div className="sticky bottom-0 bg-white/90 backdrop-blur-sm border-t border-gray-100 px-4 py-2 text-center text-xs text-gray-400 font-medium">
          共 {pageCount} 页
        </div>
      )}
    </div>
  );
}

export default function FilePreviewModal({ url, filename, onClose }: FilePreviewModalProps) {
  const [preview, setPreview] = useState<PreviewState>({ status: 'loading' });

  // --- History API Integration for Mobile Back Gesture ---
  useEffect(() => {
    // Push a new state into history when the modal opens
    window.history.pushState({ modal: 'filePreview' }, '');

    const handlePopState = (e: PopStateEvent) => {
      // If the back button is pressed, the state we pushed is popped.
      // We just call onClose to hide the modal.
      e.preventDefault();
      onClose();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [onClose]);

  const handleClose = () => {
    // When manually closing via button or backdrop, navigate back
    // to remove the history state we pushed, which triggers popstate -> onClose
    window.history.back();
  };

  useEffect(() => {
    loadPreview();
  }, [url, filename]);

  async function loadPreview() {
    try {
      // Proactive check to ensure file exists before attempting any rendering logic
      const headResponse = await fetch(url, { method: 'HEAD' });
      if (!headResponse.ok) {
        if (headResponse.status === 404) {
          setPreview({ status: 'error', message: '文件未找到或已被删除' });
          return;
        }
        // If it's another error (like 500), we still let it try the specific loaders 
        // which might have better error handling, or we can just throw here.
        // Let's throw to be safe and clear.
        throw new Error(`无法访问文件 (${headResponse.status})`);
      }
    } catch (err: any) {
      setPreview({ status: 'error', message: err.message || '网络请求失败，文件不可访问' });
      return;
    }

    const fileType = getFileType(filename);

    switch (fileType) {
      case 'image':
        setPreview({ status: 'ready', type: 'image' });
        return;
      case 'pdf':
        setPreview({ status: 'ready', type: 'pdf' });
        return;
      case 'docx':
      case 'xlsx':
      case 'csv':
      case 'pptx':
        await loadOfficeFile(fileType);
        return;
      case 'text':
      case 'code':
        await loadText(fileType as 'text' | 'code');
        return;
      default:
        setPreview({ status: 'ready', type: 'unsupported' });
    }
  }

  async function loadOfficeFile(fileType: string) {
    const caps = await getCapabilities();

    if (caps.libreoffice) {
      const pathParam = extractPathParam(url);
      if (pathParam) {
        const previewUrl = `/api/files/preview?path=${pathParam}`;
        setPreview({ status: 'ready', type: 'pdf', pdfUrl: previewUrl });
        return;
      }
      
      // Support for /uploads/filename
      if (url.startsWith('/uploads/')) {
        const filenameInUrl = url.split('/').pop();
        if (filenameInUrl) {
          // The filename in URL is likely already encoded by the browser/server.
          // We decode it first to get the raw name, then encode it for the query param.
          const rawFilename = decodeURIComponent(filenameInUrl);
          const previewUrl = `/api/files/preview?filename=${encodeURIComponent(rawFilename)}`;
          setPreview({ status: 'ready', type: 'pdf', pdfUrl: previewUrl });
          return;
        }
      }
    }

    switch (fileType) {
      case 'docx':
        await loadDocxFallback();
        return;
      case 'xlsx':
      case 'csv':
        await loadXlsxFallback();
        return;
      default:
        setPreview({ status: 'ready', type: 'unsupported' });
    }
  }

  async function loadDocxFallback() {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(response.status === 404 ? '文件未找到或已被删除' : `加载失败 (${response.status})`);
      const arrayBuffer = await response.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      setPreview({ status: 'ready', type: 'html', content: result.value });
    } catch (err: any) {
      setPreview({ status: 'error', message: `无法预览 Word 文档: ${err.message}` });
    }
  }

  async function loadXlsxFallback() {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(response.status === 404 ? '文件未找到或已被删除' : `加载失败 (${response.status})`);
      const arrayBuffer = await response.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      const htmlParts: string[] = [];
      workbook.SheetNames.forEach((name) => {
        const sheet = workbook.Sheets[name];
        const html = XLSX.utils.sheet_to_html(sheet, { editable: false });
        htmlParts.push(
          `<div class="sheet-tab">${workbook.SheetNames.length > 1 ? `<h3 style="margin: 16px 0 8px; font-size: 14px; font-weight: 700; color: #374151;">📄 ${name}</h3>` : ''}${html}</div>`
        );
      });

      setPreview({ status: 'ready', type: 'html', content: htmlParts.join('') });
    } catch (err: any) {
      setPreview({ status: 'error', message: `无法预览表格文件: ${err.message}` });
    }
  }

  async function loadText(type: 'text' | 'code') {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(response.status === 404 ? '文件未找到或已被删除' : `加载失败 (${response.status})`);
      const buffer = await response.arrayBuffer();
      
      let decoder = new TextDecoder('utf-8', { fatal: true });
      let text = '';
      try {
        text = decoder.decode(buffer);
      } catch {
        decoder = new TextDecoder('gbk');
        text = decoder.decode(buffer);
      }
      
      setPreview({ status: 'ready', type, content: text });
    } catch (err: any) {
      setPreview({ status: 'error', message: `无法预览文本文件: ${err.message}` });
    }
  }

  function handleDownload() {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const ext = filename.split('.').pop()?.toUpperCase() || '';
  const { Icon, typeText, bgColor } = getFileIconInfo(filename);

  return (
    <div 
      className="fixed inset-0 z-[200] bg-slate-500/60 backdrop-blur-md flex flex-col animate-in fade-in duration-200"
      onClick={handleClose}
    >
      {/* Top toolbar - Light Theme */}
      <div 
        className="flex items-center justify-between px-4 sm:px-6 py-2.5 bg-white/95 border-b border-gray-200 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`hidden sm:flex w-8 h-8 rounded-lg ${bgColor} items-center justify-center flex-shrink-0 text-white border border-black/5 shadow-sm`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-gray-900 font-semibold text-sm truncate max-w-[50vw]">{filename}</h3>
            <p className="text-gray-500 text-[10px] font-medium tracking-wider uppercase">{ext} • {typeText}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">


          <button 
            onClick={handleDownload}
            className="h-9 flex items-center gap-1.5 px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold transition-all border border-gray-200"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">下载</span>
          </button>
          <button 
            onClick={handleClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all border border-gray-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content area */}
      <div 
        className="flex-1 flex items-center justify-center p-0 sm:p-6 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {preview.status === 'loading' && (
          <div className="flex flex-col items-center gap-4 text-gray-500">
            <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
            <p className="text-sm font-medium">正在加载预览...</p>
          </div>
        )}

        {preview.status === 'error' && (
          <div className="flex flex-col items-center gap-4 text-gray-600 bg-white p-8 rounded-3xl max-w-md text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center">
              <X className="w-8 h-8 text-red-500" />
            </div>
            <p className="text-sm font-medium">{preview.message}</p>
            <button
              onClick={handleClose}
              className="px-8 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-white text-sm font-bold transition-all flex items-center gap-2"
            >
              关闭
            </button>
          </div>
        )}

        {preview.status === 'ready' && preview.type === 'image' && (
          <ZoomableWrapper center>
            <div className="p-4 flex items-center justify-center min-h-full">
              <img 
                src={url} 
                alt={filename}
                className="max-w-full max-h-[80vh] object-contain rounded-xl border-4 border-white shadow-lg"
              />
            </div>
          </ZoomableWrapper>
        )}

        {preview.status === 'ready' && preview.type === 'pdf' && (
          <ZoomableWrapper>
            <PdfCanvasViewer pdfUrl={preview.pdfUrl || url} />
          </ZoomableWrapper>
        )}

        {preview.status === 'ready' && preview.type === 'html' && (
          <ZoomableWrapper>
            <div 
              className="w-full max-w-5xl mx-auto overflow-hidden bg-white sm:rounded-2xl p-4 sm:p-10 sm:border border-gray-200 shadow-sm"
              dangerouslySetInnerHTML={{ __html: `
                <style>
                  .preview-root { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; line-height: 1.7; font-size: 15px; }
                  .preview-root h1 { font-size: 24px; font-weight: 800; margin: 24px 0 12px; color: #111827; }
                  .preview-root h2 { font-size: 20px; font-weight: 700; margin: 20px 0 10px; color: #1f2937; }
                  .preview-root h3 { font-size: 17px; font-weight: 600; margin: 16px 0 8px; color: #374151; }
                  .preview-root p { margin: 8px 0; }
                  .preview-root ul, .preview-root ol { padding-left: 24px; margin: 8px 0; }
                  .preview-root li { margin: 4px 0; }
                  .preview-root table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px; }
                  .preview-root th, .preview-root td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
                  .preview-root th { background: #f9fafb; font-weight: 600; color: #374151; }
                  .preview-root tr:nth-child(even) { background: #fafbfc; }
                  .preview-root tr:hover { background: #f0f4ff; }
                  .preview-root img { max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0; }
                  .preview-root a { color: #2563eb; text-decoration: none; }
                  .preview-root a:hover { text-decoration: underline; }
                  .preview-root blockquote { border-left: 3px solid #d1d5db; padding-left: 16px; margin: 12px 0; color: #6b7280; }
                </style>
                <div class="preview-root">${preview.content || ''}</div>
              ` }}
            />
          </ZoomableWrapper>
        )}

        {preview.status === 'ready' && (preview.type === 'text' || preview.type === 'code') && (
          <ZoomableWrapper>
            <div className="w-full max-w-5xl mx-auto flex-1 bg-white sm:bg-slate-50 sm:rounded-2xl sm:border border-gray-200 shadow-sm">
              <pre 
                className="p-6 sm:p-10 leading-relaxed text-slate-800 font-mono whitespace-pre-wrap break-words transition-all duration-200"
              >
                {preview.content}
              </pre>
            </div>
          </ZoomableWrapper>
        )}

        {preview.status === 'ready' && preview.type === 'unsupported' && (
          <div className="flex flex-col items-center gap-6 bg-white p-10 rounded-3xl max-w-md text-center border border-gray-100">
            <div className={`w-20 h-20 rounded-3xl ${bgColor.replace('bg-', 'bg-opacity-10 bg-')} flex items-center justify-center`}>
              <Icon className={`w-10 h-10 ${bgColor.replace('bg-', 'text-')}`} />
            </div>
            <div>
              <p className="text-gray-900 font-bold text-xl mb-1">{filename}</p>
              <p className="text-gray-500 text-sm">该文件类型暂不支持在线预览</p>
              {ext !== 'PDF' && (
                <p className="text-blue-500/60 text-xs mt-2 font-medium bg-blue-50 py-1 px-3 rounded-full inline-block">
                  安装 LibreOffice 可提升办公文档预览效果
                </p>
              )}
            </div>
            <button
              onClick={handleDownload}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl text-white text-sm font-bold transition-all flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              下载文件
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
