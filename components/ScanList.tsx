import React from 'react';
import { StudentRecord, PageType, StudentInfoData, EduStatsData, VibeMatchData } from '../types';

interface ScanListProps {
  records: StudentRecord[];
  activeType: PageType;
  onDelete: (id: string) => void;
  onUpdate: (id: string, newData: any) => void;
}

const EditableCell = ({ value, onChange, className = "" }: { value: string | number | null, onChange: (val: string) => void, className?: string }) => {
  return (
    <input
      className={`w-full bg-transparent border border-transparent hover:border-gray-300 focus:border-brand-500 rounded px-2 py-1 text-sm text-gray-900 transition-colors focus:outline-none focus:bg-white ${className}`}
      value={value === null || value === undefined ? '' : value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

const ScanList: React.FC<ScanListProps> = ({ records, activeType, onDelete, onUpdate }) => {
  // Filter records to only show those matching the active tab
  const displayedRecords = records.filter(r => r.pageType === activeType);

  if (displayedRecords.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-lg border border-dashed border-gray-300">
        <p className="text-gray-500">No {activeType} sheets scanned yet.</p>
      </div>
    );
  }

  const renderHeaders = () => {
    switch (activeType) {
      case PageType.STUDENT_INFO:
        return (
          <>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student ID</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">First Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Parent Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">School</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grade</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">City</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mobile No</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
          </>
        );
      case PageType.VIBE_MATCH:
        return (
          <>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student ID</th>
            {Array.from({ length: 14 }, (_, i) => i + 1).map(num => (
              <th key={num} className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase">Q{num}</th>
            ))}
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Q15 (Statement)</th>
          </>
        );
      case PageType.EDU_STATS:
        return (
          <>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student ID</th>
            {Array.from({ length: 15 }, (_, i) => i + 1).map(num => (
              <th key={num} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase whitespace-nowrap">Q{num}</th>
            ))}
          </>
        );
    }
  };

  const renderRow = (record: StudentRecord) => {
    const { id, data } = record;
    
    const handleChange = (field: string, val: string) => {
      onUpdate(id, { ...data, [field]: val });
    };

    switch (activeType) {
      case PageType.STUDENT_INFO: {
        const d = data as StudentInfoData;
        return (
          <>
            <td className="px-2 py-2 w-32"><EditableCell value={d.studentId} onChange={(v) => handleChange('studentId', v)} className="font-medium" /></td>
            <td className="px-2 py-2 w-32"><EditableCell value={d.firstName} onChange={(v) => handleChange('firstName', v)} /></td>
            <td className="px-2 py-2 w-32"><EditableCell value={d.lastName} onChange={(v) => handleChange('lastName', v)} /></td>
            <td className="px-2 py-2 w-40"><EditableCell value={d.parentName} onChange={(v) => handleChange('parentName', v)} /></td>
            <td className="px-2 py-2 w-40"><EditableCell value={d.schoolName} onChange={(v) => handleChange('schoolName', v)} /></td>
            <td className="px-2 py-2 w-32"><EditableCell value={d.date} onChange={(v) => handleChange('date', v)} /></td>
            <td className="px-2 py-2 w-24"><EditableCell value={d.grade} onChange={(v) => handleChange('grade', v)} /></td>
            <td className="px-2 py-2 w-32"><EditableCell value={d.city} onChange={(v) => handleChange('city', v)} /></td>
            <td className="px-2 py-2 w-32"><EditableCell value={d.whatsappNumber} onChange={(v) => handleChange('whatsappNumber', v)} className="font-mono" /></td>
            <td className="px-2 py-2 w-48"><EditableCell value={d.email} onChange={(v) => handleChange('email', v)} /></td>
          </>
        );
      }
      case PageType.VIBE_MATCH: {
        const d = data as VibeMatchData;
        return (
          <>
            <td className="px-2 py-2 w-32"><EditableCell value={d.studentId} onChange={(v) => handleChange('studentId', v)} className="font-medium" /></td>
            {Array.from({ length: 14 }, (_, i) => i + 1).map(num => (
              <td key={num} className="px-1 py-2 text-center w-12">
                 <EditableCell 
                    value={(d as any)[`q${num}`]} 
                    onChange={(v) => handleChange(`q${num}`, v)} 
                    className="text-center font-mono"
                 />
              </td>
            ))}
            <td className="px-2 py-2 min-w-[200px]"><EditableCell value={d.handwrittenStatement} onChange={(v) => handleChange('handwrittenStatement', v)} /></td>
          </>
        );
      }
      case PageType.EDU_STATS: {
        const d = data as EduStatsData;
        return (
          <>
            <td className="px-2 py-2 w-32"><EditableCell value={d.studentId} onChange={(v) => handleChange('studentId', v)} className="font-medium" /></td>
            {Array.from({ length: 15 }, (_, i) => i + 1).map(num => (
              <td key={num} className="px-2 py-2 min-w-[120px]">
                <EditableCell value={(d as any)[`q${num}`]} onChange={(v) => handleChange(`q${num}`, v)} />
              </td>
            ))}
          </>
        );
      }
      default: return null;
    }
  };

  return (
    <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {renderHeaders()}
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {displayedRecords.map((record) => (
              <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                {renderRow(record)}
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button 
                    onClick={() => onDelete(record.id)}
                    className="text-red-600 hover:text-red-900"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ScanList;