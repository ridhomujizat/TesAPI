import type { EnvironmentsFile, KeyValue } from '../../types';

interface SharedVariable extends Omit<KeyValue, 'value' | 'files'> { value?: string; secret: boolean }
interface SharedEnvironment { id: string; name: string; variables: SharedVariable[] }
export interface SharedEnvironmentsFile { schemaVersion: 2; environments: SharedEnvironment[] }
export interface LocalEnvironmentsFile { schemaVersion: 1; activeEnvironmentId: string | null; values: Record<string, string> }

const valueId = (environmentId: string, variableId: string) => `${environmentId}/${variableId}`;

export function serializeSharedEnvironments(file: EnvironmentsFile): SharedEnvironmentsFile {
  return {
    schemaVersion: 2,
    environments: file.environments.map((environment) => ({
      id: environment.id,
      name: environment.name,
      variables: environment.variables.map(({ value, files: _files, ...variable }) => ({
        ...variable,
        secret: variable.secret !== false,
        ...(variable.secret === false ? { value } : {}),
      })),
    })),
  };
}

export function serializeLocalEnvironments(file: EnvironmentsFile): LocalEnvironmentsFile {
  const values: Record<string, string> = {};
  for (const environment of file.environments) {
    for (const variable of environment.variables) {
      if (variable.secret !== false) values[valueId(environment.id, variable.id)] = variable.value;
    }
  }
  return { schemaVersion: 1, activeEnvironmentId: file.activeEnvironmentId, values };
}

export function mergeEnvironmentFiles(shared: SharedEnvironmentsFile, local: LocalEnvironmentsFile): EnvironmentsFile {
  return {
    schemaVersion: 2,
    activeEnvironmentId: local.activeEnvironmentId,
    environments: shared.environments.map((environment) => ({
      id: environment.id,
      name: environment.name,
      variables: environment.variables.map((variable) => ({
        ...variable,
        value: variable.secret ? local.values[valueId(environment.id, variable.id)] ?? '' : variable.value ?? '',
      })),
    })),
  };
}
