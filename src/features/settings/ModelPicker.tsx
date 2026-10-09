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
  // 搜索输入与已选值分离：已保存的选择不受搜索过滤影响，展开全部始终可达完整目录。
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // 展示值跟随已选值；只有正在编辑时才显示搜索输入。展开按钮不聚焦输入，故展开全部不受已选值过滤。
  const shown = editing ? search : value;
  const query = search.trim().toLowerCase();
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
    setSearch('');
    setEditing(false);
    setOpen(false);
  }
  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      setSearch('');
      setEditing(false);
      setOpen(false);
      return;
    }
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      event.preventDefault();
      setSearch('');
      setOpen(true);
      return;
    }
    if (!open) return;
    if (!filtered.length) {
      // 无匹配时回车即保留手填值。
      if (event.key === 'Enter') {
        event.preventDefault();
        setSearch('');
        setEditing(false);
        setOpen(false);
      }
      return;
    }
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
          value={shown}
          maxLength={256}
          autoComplete="off"
          spellCheck={false}
          placeholder="选择模型或手动填写"
          onChange={(event) => {
            setSearch(event.target.value);
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setEditing(true);
            setSearch(value);
            setOpen(true);
          }}
          onBlur={() => setEditing(false)}
          onKeyDown={onKeyDown}
        />
        <button
          data-interaction-id="model-picker:toggle"
          type="button"
          className="button"
          aria-label={open ? '收起模型列表' : '展开模型列表'}
          aria-expanded={open}
          disabled={disabled}
          onClick={() => {
            setSearch('');
            setOpen((shown) => !shown);
          }}
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
              没有匹配的目录项，回车即保留手填值“{search.trim()}”。
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
