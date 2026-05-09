import type { Port, PortType } from '../types/index.ts';

export class PortImpl implements Port {
  id: string;
  name: string;
  type: PortType;
  required: boolean;
  defaultValue?: unknown;
  schema?: unknown;

  constructor(config: {
    id?: string;
    name: string;
    type: PortType;
    required?: boolean;
    defaultValue?: unknown;
    schema?: unknown;
  }) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.type = config.type;
    this.required = config.required ?? false;
    this.defaultValue = config.defaultValue;
    this.schema = config.schema;
  }
}
