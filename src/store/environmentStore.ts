import { create } from 'zustand';
import type { EnvironmentsFile, KeyValue } from '../types';
import { emptyRow, withTrailingBlank } from '../lib/params';
import { uid } from '../lib/id';
import { storageProvider } from '../lib/storage/localJson';

interface State {
  file: EnvironmentsFile;
  initialize: () => Promise<void>;
  createEnvironment: (name: string) => Promise<void>;
  setActive: (id: string | null) => Promise<void>;
  setVariables: (id: string, variables: KeyValue[]) => Promise<void>;
}

const empty: EnvironmentsFile = { schemaVersion: 1, activeEnvironmentId: null, environments: [] };
let saveTimer = 0;

function saveSoon(file: EnvironmentsFile): void {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void storageProvider.saveEnvironments(file).catch((error) => console.error('Could not save environments', error));
  }, 500);
}

export const useEnvironmentStore = create<State>((set, get) => ({
  file: empty,
  initialize: async () => set({ file: await storageProvider.loadEnvironments() }),
  createEnvironment: async (name) => {
    const environment = { id: uid(), name: name.trim() || 'Environment', variables: [emptyRow()] };
    const file = { ...get().file, activeEnvironmentId: environment.id, environments: [...get().file.environments, environment] };
    await storageProvider.saveEnvironments(file);
    window.clearTimeout(saveTimer);
    set({ file });
  },
  setActive: async (activeEnvironmentId) => {
    const file = { ...get().file, activeEnvironmentId };
    await storageProvider.saveEnvironments(file);
    window.clearTimeout(saveTimer);
    set({ file });
  },
  setVariables: async (id, variables) => {
    const file = { ...get().file, environments: get().file.environments.map((environment) => environment.id === id ? { ...environment, variables: withTrailingBlank(variables) } : environment) };
    set({ file });
    saveSoon(file);
  },
}));

export const activeVariables = () => {
  const { file } = useEnvironmentStore.getState();
  return file.environments.find((environment) => environment.id === file.activeEnvironmentId)?.variables ?? [];
};
