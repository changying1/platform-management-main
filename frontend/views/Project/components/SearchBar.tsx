import React, { useState, useEffect, useRef } from 'react';
import { Search, Filter } from 'lucide-react';

interface SearchBarProps {
  searchQuery: string;
  selectedBranchId: number | null;
  onSearchChange: (query: string) => void;
  onBranchChange: (branchId: number | null) => void;
  onSearch: () => void;
}

interface Branch {
  id: number;
  name: string;
}

export function SearchBar({ searchQuery, selectedBranchId, onSearchChange, onBranchChange, onSearch }: SearchBarProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const currentQueryRef = useRef<string>(searchQuery);

  useEffect(() => {
    currentQueryRef.current = searchQuery;
  }, [searchQuery]);

  useEffect(() => {
    fetch('/api/dashboard/branches')
      .then(res => res.json())
      .then(data => {
        setBranches(data);
      })
      .catch(err => console.error('Failed to fetch branches:', err));
  }, []);

  const handleInputChange = (value: string) => {
    onSearchChange(value);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      onSearch();
    }, 300);
  };

  const handleBranchChange = (branchId: number | null) => {
    onBranchChange(branchId);
    onSearch();
  };

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <div className="relative flex-1 min-w-[200px] max-w-[400px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
        <input
          type="text"
          placeholder="搜索项目名称、负责人、项目人员..."
          value={searchQuery}
          onChange={(e) => handleInputChange(e.target.value)}
          className="w-full bg-slate-800/80 border border-white/20 rounded-lg py-2.5 pl-10 pr-4 text-white text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-2">
        <Filter className="text-gray-400" size={16} />
        <select
          value={selectedBranchId || ''}
          onChange={(e) => handleBranchChange(e.target.value ? Number(e.target.value) : null)}
          className="bg-slate-800/80 border border-white/20 rounded-lg px-3 py-2.5 text-white text-sm focus:border-blue-500 focus:outline-none appearance-none cursor-pointer"
          style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%239ca3af\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center',
            backgroundSize: '16px',
            paddingRight: '32px'
          }}
        >
          <option value="" className="bg-slate-800 text-white">全部分公司</option>
          {branches.map(branch => (
            <option key={branch.id} value={branch.id} className="bg-slate-800 text-white">{branch.name}</option>
          ))}
        </select>
      </div>
    </div>
  );
}