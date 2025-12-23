import React, { useState, useRef, useCallback } from 'react';
import { processOmrImage } from './services/geminiService';
import { StudentRecord, ScanStatus, PageType, StudentInfoData, EduStatsData, VibeMatchData } from './types';
import ScanList from './components/ScanList';

// Add type definition for pdfjsLib on window
declare global {
  interface Window {
    pdfjsLib: any;
  }
}

const escapeCsv = (val: any): string => {
  if (val === null || val === undefined) return '""';
  const str = String(val);
  return `"${str.replace(/"/g, '""')}"`;
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<PageType>(PageType.STUDENT_INFO);
  const [records, setRecords] = useState<StudentRecord[]>([]);
  const [status, setStatus] = useState<ScanStatus>(ScanStatus.IDLE);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [progress, setProgress] = useState<{current: number, total: number} | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to read PDF and convert to images
  const convertPdfToImages = async (file: File): Promise<{ base64: string; groupId: string | null }[]> => {
    return new Promise(async (resolve, reject) => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument(arrayBuffer).promise;
        const totalPages = pdf.numPages;
        const images: { base64: string; groupId: string | null }[] = [];
        
        // Group logic: We assume serial order. Page 1,2,3 belong to Student A. Page 4,5,6 to Student B.
        // We generate a UUID for every chunk of 3 pages.
        let currentGroupId = crypto.randomUUID();

        for (let i = 1; i <= totalPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.0 }); // Scale up for better OCR
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({ canvasContext: context, viewport: viewport }).promise;
          const base64 = canvas.toDataURL('image/jpeg', 0.8);

          // Update Group ID every 3 pages
          // Index i is 1-based.
          // 1,2,3 -> Group A
          // 4,5,6 -> Group B
          if (i > 1 && (i - 1) % 3 === 0) {
             currentGroupId = crypto.randomUUID();
          }

          images.push({ base64, groupId: currentGroupId });
        }
        resolve(images);
      } catch (e) {
        reject(e);
      }
    });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setStatus(ScanStatus.SCANNING);
    setErrorMsg(null);

    const fileList: File[] = Array.from(files);
    
    // 1. Pre-process files (Convert PDFs to Images, keep Images as is)
    // We create a unified queue of items to process.
    let itemsToProcess: { base64: string; fileType: string; fileName: string; groupId: string | null }[] = [];

    try {
      for (const file of fileList) {
        if (file.type === 'application/pdf') {
          // If PDF, extract all pages and apply serial grouping
          const pdfImages = await convertPdfToImages(file);
          pdfImages.forEach(img => {
            itemsToProcess.push({
               base64: img.base64,
               fileType: 'pdf_page',
               fileName: file.name,
               groupId: img.groupId // PDF pages get a linked ID
            });
          });
        } else {
          // Normal Image
          const readFileAsBase64 = (f: File): Promise<string> => {
              return new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.onerror = reject;
                  reader.readAsDataURL(f);
              });
          };
          const base64 = await readFileAsBase64(file);
          itemsToProcess.push({
            base64,
            fileType: 'image',
            fileName: file.name,
            groupId: null // Individual images don't get auto-grouped unless we add logic later
          });
        }
      }
    } catch (err) {
      console.error("Error preparing files:", err);
      setStatus(ScanStatus.ERROR);
      setErrorMsg("Failed to read files (PDF conversion or image reading failed).");
      return;
    }

    const totalItems = itemsToProcess.length;
    setProgress({ current: 0, total: totalItems });

    // 2. Process Queue
    const processItem = async (item: typeof itemsToProcess[0]): Promise<boolean> => {
      try {
        const result = await processOmrImage(item.base64, activeTab);
        
        const newRecord: StudentRecord = {
          id: crypto.randomUUID(),
          scannedAt: new Date().toISOString(),
          originalImageUrl: item.base64,
          pageType: result.pageType,
          data: result.data,
          confidenceScore: result.confidenceScore,
          linkedGroupId: item.groupId || undefined // Store the group ID
        };

        setRecords(prev => [newRecord, ...prev]);
        return true;
      } catch (err) {
        console.error(`Error processing item from ${item.fileName}:`, err);
        return false;
      } finally {
        setProgress(prev => {
          if (!prev) return { current: 1, total: totalItems };
          return { ...prev, current: Math.min(prev.current + 1, totalItems) };
        });
      }
    };

    // Process with concurrency limit
    const CONCURRENCY_LIMIT = 5;
    const results: boolean[] = [];
    const activePromises = new Set<Promise<void>>();

    for (const item of itemsToProcess) {
        if (activePromises.size >= CONCURRENCY_LIMIT) {
            await Promise.race(activePromises);
        }

        const promise = processItem(item).then((success) => {
            results.push(success);
        });
        
        activePromises.add(promise);
        promise.then(() => activePromises.delete(promise));
    }

    await Promise.all(activePromises);

    const failCount = results.filter(success => !success).length;
    setProgress(null);

    if (failCount === totalItems) {
      setStatus(ScanStatus.ERROR);
      setErrorMsg("Failed to process items. Please check your API quota.");
    } else if (failCount > 0) {
      console.warn(`${failCount} items failed to process.`);
      setStatus(ScanStatus.SUCCESS);
    } else {
      setStatus(ScanStatus.SUCCESS);
    }
    
    event.target.value = '';
  };

  const deleteRecord = (id: string) => {
    setRecords(prev => prev.filter(r => r.id !== id));
  };

  const clearAllRecords = () => {
    if (confirm("Are you sure you want to delete all scanned records for " + activeTab + "?")) {
      setRecords(prev => prev.filter(r => r.pageType !== activeTab));
    }
  };

  const updateRecord = (id: string, newData: any) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, data: newData } : r));
  };

  const generateCSVData = useCallback(() => {
    if (activeTab === PageType.MIX) return null;

    const currentRecords = records.filter(r => r.pageType === activeTab);
    if (currentRecords.length === 0) return null;

    let headers: string[] = [];
    let rows: (string[] | null)[] = [];

    // Add Group ID to headers
    const commonHeaders = ["Linked Group ID"];

    if (activeTab === PageType.STUDENT_INFO) {
      headers = [...commonHeaders, "Student ID", "Student Name", "First Name", "Last Name", "Parent Name", "School", "Date", "Grade", "City", "Contact", "Email", "Scanned At"];
      rows = currentRecords.map(r => {
        try {
          const d = r.data as StudentInfoData;
          if (!d) return null;
          return [
            escapeCsv(r.linkedGroupId || ""),
            escapeCsv(d.studentId),
            escapeCsv(d.studentName),
            escapeCsv(d.firstName),
            escapeCsv(d.lastName),
            escapeCsv(d.parentName),
            escapeCsv(d.schoolName),
            escapeCsv(d.date),
            escapeCsv(d.grade),
            escapeCsv(d.city),
            escapeCsv(d.contactNumber),
            escapeCsv(d.email),
            escapeCsv(new Date(r.scannedAt).toLocaleString())
          ];
        } catch (error) { return null; }
      });
    } else if (activeTab === PageType.VIBE_MATCH) {
      const qHeaders = Array.from({ length: 14 }, (_, i) => `Q${i + 1}`);
      headers = [...commonHeaders, "Student ID", ...qHeaders, "Q15 (Statement)", "Scanned At"];
      rows = currentRecords.map(r => {
        try {
          const d = r.data as VibeMatchData;
          if (!d) return null;
          const qValues = Array.from({ length: 14 }, (_, i) => {
            const val = (d as any)[`q${i + 1}`];
            return escapeCsv(val);
          });
          return [
            escapeCsv(r.linkedGroupId || ""),
            escapeCsv(d.studentId),
            ...qValues,
            escapeCsv(d.handwrittenStatement),
            escapeCsv(new Date(r.scannedAt).toLocaleString())
          ];
        } catch (error) { return null; }
      });
    } else if (activeTab === PageType.EDU_STATS) {
      const qHeaders = Array.from({ length: 15 }, (_, i) => `Q${i + 1}`);
      headers = [...commonHeaders, "Student ID", ...qHeaders, "Scanned At"];
      rows = currentRecords.map(r => {
        try {
          const d = r.data as EduStatsData;
          if (!d) return null;
          const qValues = Array.from({ length: 15 }, (_, i) => {
            const val = (d as any)[`q${i + 1}`];
            return escapeCsv(val);
          });
          return [
            escapeCsv(r.linkedGroupId || ""),
            escapeCsv(d.studentId),
            ...qValues,
            escapeCsv(new Date(r.scannedAt).toLocaleString())
          ];
        } catch (error) { return null; }
      });
    }

    const validRows = rows.filter((r): r is string[] => r !== null);
    if (validRows.length === 0) return null;

    return [headers.join(','), ...validRows.map(r => r.join(','))].join('\n');
  }, [records, activeTab]);

  const exportCSV = useCallback(() => {
    const csvContent = generateCSVData();
    if (!csvContent) {
      if (activeTab === PageType.MIX) {
        alert("Please switch to a specific Page tab (Page 1, 2, or 3) to export that specific data.");
      } else if (records.filter(r => r.pageType === activeTab).length > 0) {
        alert("Could not generate CSV data. Please check console for errors.");
      }
      return;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    const fileName = `${(activeTab || "export").replace(/\s/g, '_')}_export.csv`;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [generateCSVData, activeTab, records]);

  const copyToClipboard = useCallback(async () => {
    const csvContent = generateCSVData();
    if (!csvContent) {
        if (activeTab === PageType.MIX) alert("Please switch to a specific Page tab to copy data.");
        return;
    }
    try {
      await navigator.clipboard.writeText(csvContent);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }, [generateCSVData, activeTab]);

  const activeRecordsCount = records.filter(r => r.pageType === activeTab).length;

  const getCount = (type: PageType) => records.filter(r => r.pageType === type).length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-900">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-8 h-8 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">OMR Scanner Pro</h1>
          </div>
          <div className="flex gap-2">
             {activeRecordsCount > 0 && activeTab !== PageType.MIX && (
                <button
                  onClick={clearAllRecords}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm bg-white text-red-600 hover:bg-red-50 focus:outline-none"
                >
                  Clear All
                </button>
             )}
             <button
                onClick={copyToClipboard}
                disabled={activeRecordsCount === 0}
                className={`inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm bg-white text-gray-700 
                  ${activeRecordsCount === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500'}`}
              >
                {copySuccess ? "Copied!" : "Copy"}
              </button>
             <button
                onClick={exportCSV}
                disabled={activeRecordsCount === 0 && activeTab !== PageType.MIX}
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white 
                  ${(activeRecordsCount === 0 && activeTab !== PageType.MIX) ? 'bg-gray-300 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500'}`}
              >
                Export CSV {activeTab !== PageType.MIX && `(${activeRecordsCount})`}
              </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Page Type Tabs */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8" aria-label="Tabs">
              {Object.values(PageType).map((type) => (
                <button
                  key={type}
                  onClick={() => setActiveTab(type)}
                  className={`
                    whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors
                    ${activeTab === type
                      ? 'border-brand-500 text-brand-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                  `}
                >
                  {type}
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Upload Section */}
        <section className="mb-8">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`
              relative block w-full rounded-lg border-2 border-dashed p-12 text-center hover:border-brand-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 cursor-pointer transition-all duration-200
              ${status === ScanStatus.SCANNING ? 'border-brand-500 bg-brand-50' : 'border-gray-300 bg-white hover:bg-gray-50'}
            `}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept="image/*,application/pdf"
              multiple
              onChange={handleFileUpload}
              disabled={status === ScanStatus.SCANNING}
            />
            
            {status === ScanStatus.SCANNING ? (
              <div className="flex flex-col items-center">
                <svg className="animate-spin h-10 w-10 text-brand-600 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-lg font-medium text-brand-700">
                  {activeTab === PageType.MIX ? "Extracting & Analyzing..." : `Analyzing ${activeTab}...`}
                </p>
                {progress && (
                  <p className="text-base font-semibold text-brand-600 mt-2">
                    Processing item {progress.current} of {progress.total}
                  </p>
                )}
                <p className="text-sm text-brand-500 mt-1">
                  Processing PDFs and images...
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                 <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="mt-2 block text-sm font-semibold text-gray-900">
                  {activeTab === PageType.MIX ? "Upload Mixed Batch or PDF" : `Scan ${activeTab}`}
                </span>
                <span className="mt-1 block text-sm text-gray-500">
                  {activeTab === PageType.MIX 
                    ? "Upload PDF (Serial P1-P2-P3) or mixed images. We'll sort and link them." 
                    : "Click to upload images or take photos"}
                </span>
              </div>
            )}
          </div>
          
          {errorMsg && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md flex items-center">
              <svg className="h-5 w-5 text-red-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-red-700">{errorMsg}</span>
            </div>
          )}
        </section>

        {/* Results Content */}
        {activeTab === PageType.MIX ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[PageType.STUDENT_INFO, PageType.VIBE_MATCH, PageType.EDU_STATS].map((type) => {
              const count = getCount(type);
              return (
                <div 
                  key={type} 
                  onClick={() => setActiveTab(type)}
                  className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow cursor-pointer border border-gray-200"
                >
                  <div className="px-4 py-5 sm:p-6">
                    <dt className="text-sm font-medium text-gray-500 truncate">{type}</dt>
                    <dd className="mt-1 text-3xl font-semibold text-gray-900">{count}</dd>
                    <p className="mt-2 text-sm text-brand-600 hover:text-brand-800 font-medium">
                      View Records &rarr;
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <ScanList 
            records={records} 
            activeType={activeTab} 
            onDelete={deleteRecord}
            onUpdate={updateRecord}
          />
        )}
        
      </main>
    </div>
  );
};

export default App;