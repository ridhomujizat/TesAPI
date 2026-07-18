import type { Body, BodyType } from '../../types';
import { KeyValueEditor } from './KeyValueEditor';

const TYPES: { value: BodyType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'json', label: 'JSON' },
  { value: 'text', label: 'Text' },
  { value: 'form-data', label: 'Form Data' },
  { value: 'x-www-form-urlencoded', label: 'x-www-form-urlencoded' },
];

interface Props {
  body: Body;
  onChange: (body: Body) => void;
}

export function BodyEditor({ body, onChange }: Props) {
  const beautify = () => {
    try {
      onChange({ ...body, raw: JSON.stringify(JSON.parse(body.raw ?? ''), null, 2) });
    } catch {
      /* leave as-is on invalid JSON */
    }
  };

  const isRaw = body.type === 'json' || body.type === 'text';
  const isForm = body.type === 'form-data' || body.type === 'x-www-form-urlencoded';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="body-toolbar">
        <select
          value={body.type}
          onChange={(e) => onChange({ ...body, type: e.target.value as BodyType })}
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        {body.type === 'json' && (
          <button className="btn-ghost" onClick={beautify}>
            Beautify
          </button>
        )}
      </div>

      {body.type === 'none' && (
        <div className="empty-state">This request has no body.</div>
      )}

      {isRaw && (
        <textarea
          className="raw-editor mono"
          placeholder={body.type === 'json' ? '{\n  "key": "value"\n}' : 'Raw text body'}
          value={body.raw ?? ''}
          onChange={(e) => onChange({ ...body, raw: e.target.value })}
        />
      )}

      {isForm && (
        <KeyValueEditor
          rows={body.formData ?? []}
          onChange={(formData) => onChange({ ...body, formData })}
          showDescription={false}
        />
      )}
    </div>
  );
}
