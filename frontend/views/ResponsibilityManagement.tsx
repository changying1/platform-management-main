import React from 'react';
import { ResponsibilityUnitView } from './GridManagement/components/ResponsibilityUnit';

const ResponsibilityManagement: React.FC = () => (
  <div className="rounded-lg border border-blue-400/30 bg-slate-900/65 backdrop-blur-md p-4 h-full overflow-auto">
    <ResponsibilityUnitView />
  </div>
);

export default ResponsibilityManagement;
