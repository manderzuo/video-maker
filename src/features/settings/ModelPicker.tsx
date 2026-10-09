import {useEffect, useId, useRef, useState} from 'react';

export function ModelPicker({
  id,
  value,
  models,
  disabled,
  onChange,
}: {
  id: string;
  value: string;
  models: string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const query = value.trim().toLowerCase();
  const filtered = query ? models.filter((model) => model.toLowerCase().includes(query)) : models;
  useEffect(() => setActive(0), [filtered.length]);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open ]);
  function pick(model: string) {
    onChange(model);
    setOpen(false);
  }
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open || !filtered.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => (index + 1) % filtered.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => (index - 1 + filtered.length) % filtered.length);
    } else if (event.key === 'Enter' && filtered[active] !== undefined) {
      event.preventDefault();
      pick(filtered[active] as string);
    }
  }
  return (
    <div className="model-picker" ref={root}>
      <div className="model-picker-row">
        <input
          id={id}
          data-interaction-id="model-picker:input"
          data-field="model"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          value={value}
          maxLength={256}
          autoComplete="off"
          spellCheck={false}
          placeholder="选择模型或手动填写"
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <button
          data-interaction-id="model-picker:toggle"
          type="button"
          className="button"
          aria-label={open ? '收起模型列表' : '展开模型列表'}
          aria-expanded={open}
          disabled={disabled}
          onClick={() => setOpen((shown) => !shown)}
        >
          {open ? '收起' : `全部 ${models.length} 个`}
        </button>
      </div>
      {open ? (
        <ul id={listId} className="model-picker-list" role="listbox" aria-label="模型目录">
          {!models.length ? (
            <li className="muted" role="presentation">
              暂无目录结果，可在上方手动填写模型名称。
            </li>
          ) : !filtered.length ? (
            <li className="muted" role="presentation">
              没有匹配的目录项，回车即保留手填值“{value.trim()}”。
            </li>
          ) : (
            filtered.map((model, index) => (
              <li
                key={model}
                role="option"
                aria-selected={value === model}
                data-active={index === active}
                tabIndex={-1}
                onPointerDown={(event) => {
                  event.preventDefault();
                  pick(model);
                }}
              >
                {model}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
