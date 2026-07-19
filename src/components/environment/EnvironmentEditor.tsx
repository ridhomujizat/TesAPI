import { Layers3 } from 'lucide-react';
import { useEnvironmentStore } from '../../store/environmentStore';
import { KeyValueEditor } from '../request/KeyValueEditor';

export function EnvironmentEditor() {
  const file = useEnvironmentStore((state) => state.file);
  const setVariables = useEnvironmentStore((state) => state.setVariables);
  const active = file.environments.find((environment) => environment.id === file.activeEnvironmentId);
  const variableCount = active?.variables.filter((variable) => variable.key.trim() || variable.value.trim()).length ?? 0;

  return (
    <section className="environment-workspace">
      <div className="open-tabs">
        <div className="open-tab active environment-open-tab"><Layers3 size={13} /><span className="open-tab-name">Environment</span></div>
      </div>
      <div className="environment-header">
        <div>
          <span className="label-caps">Environment</span>
          <h1>{active?.name ?? 'No environment selected'}</h1>
        </div>
        {active && <span className="environment-status"><i /> Active</span>}
      </div>
      <div className="tabs environment-tabs"><button className="tab active">Variables<span className="count"> · {variableCount}</span></button></div>
      <div className="pane-body environment-pane">
        {active ? <KeyValueEditor rows={active.variables} onChange={(variables) => void setVariables(active.id, variables)} /> : <div className="environment-empty"><Layers3 size={22} /><strong>Select an environment</strong><span>Choose one from the sidebar to edit its variables.</span></div>}
      </div>
    </section>
  );
}
