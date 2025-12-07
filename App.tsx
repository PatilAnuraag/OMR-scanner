import React, { useState, useRef, useCallback } from 'react';
import { processOmrImage } from './services/geminiService';
import { StudentRecord, ScanStatus, PageType, StudentInfoData, EduStatsData, VibeMatchData } from './types';
import ScanList from './components/ScanList';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<PageType>(PageType.STUDENT_INFO);
  const [records, setRecords] = useState<StudentRecord[]>([]);
  const [status, setStatus] = useState<ScanStatus>(ScanStatus.IDLE);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setStatus(ScanStatus.SCANNING);
    setErrorMsg(null);

    const fileList = Array.from(files);
    let failCount = 0;

    const processFile = (file: File): Promise<void> => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
          const base64Data = e.target?.result as string;
          try {
            const result = await processOmrImage(base64Data, activeTab);
            
            const newRecord: StudentRecord = {
              id: crypto.randomUUID(),
              scannedAt: new Date().toISOString(),
              originalImageUrl: base64Data,
              pageType: activeTab,
              data: result.data,
              confidenceScore: result.confidenceScore
            };

            setRecords(prev => [newRecord, ...prev]);
          } catch (err) {
            console.error(`Error processing file ${file.name}:`, err);
            failCount++;
          } finally {
            resolve();
          }
        };
        
        reader.onerror = () => {
          console.error(`Error reading file ${file.name}`);
          failCount++;
          resolve();
        };

        reader.readAsDataURL(file);
      });
    };

    await Promise.all(fileList.map(processFile));

    if (failCount === fileList.length) {
      setStatus(ScanStatus.ERROR);
      setErrorMsg("Failed to process images. Ensure you are scanning the correct page type.");
    } else {
      setStatus(ScanStatus.SUCCESS);
    }
    
    event.target.value = ''; // Reset input
  };

  const deleteRecord = (id: string) => {
    setRecords(prev => prev.filter(r => r.id !== id));
  };

  const updateRecord = (id: string, newData: any) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, data: newData } : r));
  };

  const generateCSVData = useCallback(() => {
    const currentRecords = records.filter(r => r.pageType === activeTab);
    if (currentRecords.length === 0) return null;

    let headers: string[] = [];
    let rows: string[][] = [];

    if (activeTab === PageType.STUDENT_INFO) {
      headers = ["Student ID", "First Name", "Last Name", "Parent Name", "School", "Date", "Grade", "City", "Mobile No", "Email", "Scanned At"];
      rows = currentRecords.map(r => {
        const d = r.data as StudentInfoData;
        return [
          `"${d.studentId}"`, `"${d.firstName}"`, `"${d.lastName}"`, `"${d.parentName}"`, `"${d.schoolName}"`, `"${d.date}"`, `"${d.grade}"`, `"${d.city}"`, 
          `"${d.whatsappNumber}"`, `"${d.email}"`, `"${new Date(r.scannedAt).toLocaleString()}"`
        ];
      });
    } else if (activeTab === PageType.VIBE_MATCH) {
      // Generate Q1...Q14 headers dynamically
      const qHeaders = Array.from({ length: 14 }, (_, i) => `Q${i + 1}`);
      headers = ["Student ID", ...qHeaders, "Q15 (Statement)", "Scanned At"];
      
      rows = currentRecords.map(r => {
        const d = r.data as VibeMatchData;
        // Generate Q1...Q14 values dynamically
        const qValues = Array.from({ length: 14 }, (_, i) => {
          const val = (d as any)[`q${i + 1}`];
          return val !== null && val !== undefined ? String(val) : '';
        });
        
        return [
          `"${d.studentId}"`,
          ...qValues,
          `"${d.handwrittenStatement.replace(/"/g, '""')}"`,
          `"${new Date(r.scannedAt).toLocaleString()}"`
        ];
      });
    } else if (activeTab === PageType.EDU_STATS) {
      // Generate Q1...Q15 headers
      const qHeaders = Array.from({ length: 15 }, (_, i) => `Q${i + 1}`);
      headers = ["Student ID", ...qHeaders, "Scanned At"];
      
      rows = currentRecords.map(r => {
        const d = r.data as EduStatsData;
        // Generate Q1...Q15 values dynamically
        const qValues = Array.from({ length: 15 }, (_, i) => {
          const val = (d as any)[`q${i + 1}`];
          // Ensure we handle quotes in string content for CSV validity
          return val ? `"${val.replace(/"/g, '""')}"` : '""';
        });

        return [
          `"${d.studentId}"`,
          ...qValues,
          `"${new Date(r.scannedAt).toLocaleString()}"`
        ];
      });
    }

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }, [records, activeTab]);

  const exportCSV = useCallback(() => {
    const csvContent = generateCSVData();
    if (!csvContent) return;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${activeTab.replace(/\s/g, '_')}_export.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [generateCSVData, activeTab]);

  const copyToClipboard = useCallback(async () => {
    const csvContent = generateCSVData();
    if (!csvContent) return;

    try {
      await navigator.clipboard.writeText(csvContent);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }, [generateCSVData]);

  const activeRecordsCount = records.filter(r => r.pageType === activeTab).length;

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
             <button
                onClick={copyToClipboard}
                disabled={activeRecordsCount === 0}
                className={`inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm bg-white text-gray-700 
                  ${activeRecordsCount === 0 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500'}`}
              >
                {copySuccess ? (
                  <>
                    <svg className="mr-2 -ml-1 h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Copied!
                  </>
                ) : (
                  <>
                    <svg className="mr-2 -ml-1 h-4 w-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    Copy
                  </>
                )}
              </button>
             <button
                onClick={exportCSV}
                disabled={activeRecordsCount === 0}
                className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white 
                  ${activeRecordsCount === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500'}`}
              >
                <svg className="mr-2 -ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export CSV ({activeRecordsCount})
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
              accept="image/*"
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
                <p className="text-lg font-medium text-brand-700">Analyzing {activeTab}...</p>
                <p className="text-sm text-brand-500 mt-1">Please wait while we process the images</p>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                 <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="mt-2 block text-sm font-semibold text-gray-900">
                  Scan {activeTab}
                </span>
                <span className="mt-1 block text-sm text-gray-500">
                  Click to upload images or take photos
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

        {/* Results List */}
        <ScanList 
          records={records} 
          activeType={activeTab} 
          onDelete={deleteRecord}
          onUpdate={updateRecord}
        />
        
      </main>
    </div>
  );
};

export default App;