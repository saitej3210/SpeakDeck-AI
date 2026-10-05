import {
  useEffect,
  useRef,
  useState
} from 'react';


import {
  useNavigate,
  useParams
} from 'react-router-dom';

import { api } from '../engine/api';

import type {
  Presentation,
  CommandLog,
  SlideObject
} from '../types/presentation';

import SlideCanvas from '../components/SlideCanvas';
import VoiceCommandBar from '../components/VoiceCommandBar';

const uid = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;

const defaultStyle = (
  type: string
): any => ({
  x: 80,
  y: 140,
  w: type === 'image' ? 420 : 1000,
  h: type === 'image' ? 280 : 80,
  rotation: 0,
  fontSize: type === 'title' ? 40 : 20,
  bold: type === 'title',
  italic: false,
  underline: false,
  color: '#f5f5f7',
  align: 'left',
  zIndex: 10,
  hidden: false,
  highlighted: false,
  zoom: 1
});

export default function Editor() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [presentation, setPresentation] =
    useState<Presentation | null>(null);

  const [
    currentSlideId,
    setCurrentSlideId
  ] = useState('');

  const [
    selectedObjectId,
    setSelectedObjectId
  ] = useState<string | null>(null);

  const [logs, setLogs] =
    useState<CommandLog[]>([]);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState('');

  const [versions, setVersions] =
    useState<any[]>([]);

  const [notesLoading, setNotesLoading] =
    useState(false);

  const [search, setSearch] =
    useState('');

  const [showAdd, setShowAdd] =
    useState(false);

  const saveTimer =
    useRef<any>(null);

  const fileRef =
    useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;

    api
      .getPresentation(id)
      .then((loadedPresentation) => {
        setPresentation(loadedPresentation);

        setCurrentSlideId(
          loadedPresentation.slides[0]?.id || ''
        );
      })
      .catch((e) =>
        setError(
          e?.message ||
            'Unable to load presentation.'
        )
      );

    api
      .listVersions(id)
      .then(setVersions)
      .catch(() => {});
  }, [id]);

  function updatePresentation(
    nextPresentation: Presentation,
    autosave = true
  ) {
    nextPresentation.updatedAt =
      new Date().toISOString();

    setPresentation({
      ...nextPresentation
    });

    if (autosave) {
      setSaving(true);

      clearTimeout(saveTimer.current);

      saveTimer.current = setTimeout(() => {
        api
          .savePresentation(nextPresentation)
          .finally(() => setSaving(false));
      }, 350);
    }
  }

  if (!presentation) {
    return (
      <div
        style={{
          padding: 40,
          color: 'var(--text-dim)'
        }}
      >
        {error || 'Loading…'}
      </div>
    );
  }

  /*
   * IMPORTANT:
   * Stable non-null reference after the guard.
   * Fixes:
   * "presentation is possibly null"
   */
  const currentPresentation = presentation;

  const slide =
    currentPresentation.slides.find(
      (s) => s.id === currentSlideId
    ) ||
    currentPresentation.slides[0];

  const selectedObj =
    slide.objects.find(
      (o) => o.id === selectedObjectId
    ) || null;

  function clone() {
    return JSON.parse(
      JSON.stringify(
        currentPresentation
      )
    ) as Presentation;
  }

  function addSlide() {
    const next = clone();

    const index =
      next.slides.length + 1;

    const newSlide: any = {
      id: uid('slide'),
      index,
      layout: 'standard',
      background: '#0b0b0d',
      speakerNotes: '',
      transition: 'fade',
      objects: [
        {
          id: uid(
            `slide${index}_title`
          ),
          type: 'title',
          content: 'New Slide',
          data: {},
          style: {
            ...defaultStyle('title'),
            x: 60,
            y: 50,
            w: 1100,
            h: 90
          }
        }
      ]
    };

    next.slides.push(newSlide);

    updatePresentation(next);

    setCurrentSlideId(newSlide.id);
    setSelectedObjectId(
      newSlide.objects[0].id
    );
  }

  function deleteSlide(slideId: string) {
    if (
      currentPresentation.slides.length <=
      1
    ) {
      return;
    }

    const next = clone();

    next.slides = next.slides
      .filter((s) => s.id !== slideId)
      .map((s, index) => ({
        ...s,
        index: index + 1
      }));

    updatePresentation(next);

    if (currentSlideId === slideId) {
      setCurrentSlideId(
        next.slides[0].id
      );
    }

    setSelectedObjectId(null);
  }

  function updateObj(nextObject: SlideObject) {
    const next = clone();

    const targetSlide =
      next.slides.find(
        (s) => s.id === currentSlideId
      );

    if (!targetSlide) return;

    const objectIndex =
      targetSlide.objects.findIndex(
        (o) => o.id === nextObject.id
      );

    if (objectIndex >= 0) {
      targetSlide.objects[objectIndex] =
        nextObject;

      updatePresentation(next);
    }
  }

  function addObject(
    type: 'text' | 'shape' | 'image'
  ) {
    const next = clone();

    const targetSlide =
      next.slides.find(
        (s) => s.id === currentSlideId
      );

    if (!targetSlide) return;

    const objectNumber =
      targetSlide.objects.length + 1;

    const object: any = {
      id: uid(
        `slide${targetSlide.index}_${type}`
      ),
      type,
      content:
        type === 'text'
          ? 'New text'
          : '',
      data:
        type === 'shape'
          ? {
              shape:
                'rounded-rectangle'
            }
          : {},
      style: {
        ...defaultStyle(type),
        zIndex: objectNumber
      }
    };

    targetSlide.objects.push(object);

    updatePresentation(next);

    setSelectedObjectId(object.id);
    setShowAdd(false);
  }

  function addImage(file: File) {
    const reader = new FileReader();

    reader.onload = () => {
      const next = clone();

      const targetSlide =
        next.slides.find(
          (s) => s.id === currentSlideId
        );

      if (!targetSlide) return;

      const object: any = {
        id: uid(
          `slide${targetSlide.index}_image`
        ),
        type: 'image',
        content: file.name,
        data: {
          src: String(reader.result),
          crop: {
            x: 0,
            y: 0,
            w: 100,
            h: 100
          }
        },
        style: {
          ...defaultStyle('image'),
          zIndex:
            targetSlide.objects.length +
            1
        }
      };

      targetSlide.objects.push(object);

      updatePresentation(next);

      setSelectedObjectId(object.id);
    };

    reader.readAsDataURL(file);
  }

  function updateField(
    field: string,
    value: any
  ) {
    if (!selectedObj) return;

    const next = clone();

    const targetSlide =
      next.slides.find(
        (s) => s.id === currentSlideId
      );

    if (!targetSlide) return;

    const object =
      targetSlide.objects.find(
        (o) => o.id === selectedObj.id
      );

    if (!object) return;

    (object.style as any)[field] =
      value;

    updatePresentation(next);
  }

  function updateCrop(
    field: string,
    value: number
  ) {
    if (
      !selectedObj ||
      selectedObj.type !== 'image'
    ) {
      return;
    }

    const next = clone();

    const targetSlide =
      next.slides.find(
        (s) => s.id === currentSlideId
      );

    if (!targetSlide) return;

    const object =
      targetSlide.objects.find(
        (o) => o.id === selectedObj.id
      );

    if (!object) return;

    object.data.crop = {
      x: Number(
        object.data.crop?.x || 0
      ),
      y: Number(
        object.data.crop?.y || 0
      ),
      w: Number(
        object.data.crop?.w || 100
      ),
      h: Number(
        object.data.crop?.h || 100
      ),
      [field]: value
    };

    if (field === 'w') {
      object.data.crop.w =
        Math.max(
          10,
          Math.min(
            100 - value,
            object.data.crop.w
          )
        );
    }

    if (field === 'h') {
      object.data.crop.h =
        Math.max(
          10,
          Math.min(
            100 - value,
            object.data.crop.h
          )
        );
    }

    updatePresentation(next);
  }

  async function generateNotes() {
    if (!id) return;

    setNotesLoading(true);

    try {
      const result =
        await api.generateSpeakerNotes(
          id,
          currentSlideId
        );

      const next = clone();

      const targetSlide =
        next.slides.find(
          (s) => s.id === currentSlideId
        );

      if (targetSlide) {
        targetSlide.speakerNotes =
          result.speakerNotes;
      }

      updatePresentation(next);
    } catch (e: any) {
      setError(
        e?.message ||
          'Unable to generate notes.'
      );
    } finally {
      setNotesLoading(false);
    }
  }

  function runSearch() {
    if (!search.trim()) return;

    api
      .sendCommand({
        presentationId:
          currentPresentation.id,
        currentSlideId,
        transcript:
          `find slides mentioning ${search}`
      })
      .then((result) => {
        setLogs(result.logs || []);

        if (result.searchResults?.length) {
          setCurrentSlideId(
            result.searchResults[0]
          );
        }
      })
      .catch(() => {});
  }

  function manual(command: string) {
    api
      .sendCommand({
        presentationId:
          currentPresentation.id,
        currentSlideId,
        selectedObjectId,
        transcript: command
      })
      .then((result) => {
        setPresentation(
          result.presentation
        );

        setLogs(result.logs || []);
      })
      .catch(() => {});
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns:
          '220px 1fr 330px',
        height: '100vh'
      }}
    >
      {/* LEFT SIDEBAR */}
      <div
        style={{
          borderRight:
            '1px solid var(--border)',
          overflowY: 'auto',
          padding: 12
        }}
      >
        <button
          className="btn btn-ghost"
          style={{
            width: '100%',
            marginBottom: 10
          }}
          onClick={() =>
            navigate('/select')
          }
        >
          ← Home
        </button>

        <button
          className="btn"
          style={{
            width: '100%',
            marginBottom: 8
          }}
          onClick={addSlide}
        >
          + Add slide
        </button>

        <button
          className="btn btn-primary"
          style={{
            width: '100%',
            marginBottom: 12
          }}
          onClick={() =>
            fileRef.current?.click()
          }
        >
          ＋ Add image
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file =
              event.target.files?.[0];

            if (file) {
              addImage(file);
            }

            event.currentTarget.value = '';
          }}
        />

        {currentPresentation.slides.map(
          (s) => (
            <div
              key={s.id}
              onClick={() => {
                setCurrentSlideId(s.id);
                setSelectedObjectId(null);
              }}
              style={{
                padding: 10,
                borderRadius: 8,
                marginBottom: 8,
                cursor: 'pointer',
                border:
                  s.id === currentSlideId
                    ? '1px solid var(--accent)'
                    : '1px solid var(--border)',
                background:
                  s.id === currentSlideId
                    ? 'rgba(110,231,255,.06)'
                    : 'var(--graphite)',
                fontSize: 12
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent:
                    'space-between'
                }}
              >
                <span>
                  Slide {s.index}
                </span>

                {currentPresentation
                  .slides.length > 1 && (
                  <span
                    style={{
                      color:
                        'var(--danger)'
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      deleteSlide(s.id);
                    }}
                  >
                    ✕
                  </span>
                )}
              </div>

              <div
                style={{
                  color:
                    'var(--text-dim)',
                  marginTop: 4,
                  whiteSpace:
                    'nowrap',
                  overflow: 'hidden',
                  textOverflow:
                    'ellipsis'
                }}
              >
                {s.objects.find(
                  (o) =>
                    o.type === 'title'
                )?.content ||
                  '(untitled)'}
              </div>
            </div>
          )
        )}
      </div>

      {/* MAIN EDITOR */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        <div
          style={{
            padding:
              '12px 20px',
            borderBottom:
              '1px solid var(--border)',
            display: 'flex',
            alignItems:
              'center',
            gap: 10
          }}
        >
          <input
            className="input"
            style={{
              maxWidth: 300,
              fontWeight: 600
            }}
            value={
              currentPresentation.title
            }
            onChange={(event) =>
              updatePresentation({
                ...currentPresentation,
                title:
                  event.target.value
              })
            }
          />

          <span
            style={{
              fontSize: 12,
              color:
                'var(--text-dim)'
            }}
          >
            {saving
              ? 'Saving…'
              : 'Saved'}
          </span>

          <div
            style={{ flex: 1 }}
          />

          <input
            className="input"
            placeholder="Search slides…"
            style={{
              maxWidth: 190
            }}
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            onKeyDown={(event) => {
              if (
                event.key ===
                'Enter'
              ) {
                runSearch();
              }
            }}
          />

          <button
            className="btn"
            onClick={() =>
              setShowAdd((v) => !v)
            }
          >
            ＋ Object
          </button>

          <button
            className="btn"
            onClick={() => {
              if (!id) return;

              api
                .saveVersion(
                  id,
                  'Manual save'
                )
                .then(() =>
                  api
                    .listVersions(id)
                    .then(setVersions)
                );
            }}
          >
            Save version
          </button>

          <ExportMenu id={id!} />

          <button
            className="btn btn-primary"
            onClick={() =>
              navigate(
                `/presenter/${id}`
              )
            }
          >
            Present ▶️
          </button>
        </div>

        {showAdd && (
          <div
            style={{
              padding:
                '8px 20px',
              borderBottom:
                '1px solid var(--border)',
              display: 'flex',
              gap: 8
            }}
          >
            <button
              className="btn"
              onClick={() =>
                addObject('text')
              }
            >
              Text
            </button>

            <button
              className="btn"
              onClick={() =>
                addObject('shape')
              }
            >
              Shape
            </button>

            <button
              className="btn"
              onClick={() =>
                fileRef.current?.click()
              }
            >
              Image
            </button>
          </div>
        )}

        <div
          style={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            padding: 24
          }}
        >
          {slide && (
            <SlideCanvas
              slide={slide}
              selectedObjectId={
                selectedObjectId
              }
              onSelect={
                setSelectedObjectId
              }
              onObjectChange={
                updateObj
              }
              scale={0.75}
            />
          )}
        </div>

        <div
          style={{
            padding: 12,
            borderTop:
              '1px solid var(--border)'
          }}
        >
          <VoiceCommandBar
            presentation={
              currentPresentation
            }
            currentSlideId={
              currentSlideId
            }
            selectedObjectId={
              selectedObjectId
            }
            onUpdate={(next) =>
              updatePresentation(
                next,
                false
              )
            }
            onLogs={setLogs}
          />

          {logs.length > 0 && (
            <div
              style={{
                marginTop: 8,
                fontSize: 11,
                color:
                  'var(--text-dim)',
                maxHeight: 70,
                overflow: 'auto'
              }}
            >
              {logs.slice(-5).map(
                (log, index) => (
                  <div key={index}>
                    →{' '}
                    <b>
                      {log.intent}
                    </b>
                    : {log.message}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* INSPECTOR */}
      <div
        style={{
          borderLeft:
            '1px solid var(--border)',
          overflowY: 'auto',
          padding: 16
        }}
      >
        <div
          style={{
            fontWeight: 700,
            marginBottom: 12
          }}
        >
          Inspector
        </div>

        {selectedObj ? (
          <div
            style={{
              display: 'grid',
              gap: 10
            }}
          >
            <div
              style={{
                fontSize: 11,
                color:
                  'var(--text-dim)',
                wordBreak:
                  'break-all'
              }}
            >
              {selectedObj.id} ·{' '}
              {selectedObj.type}
            </div>

            {(
              [
                'title',
                'subtitle',
                'text'
              ] as string[]
            ).includes(
              selectedObj.type
            ) && (
              <textarea
                className="input"
                rows={4}
                value={
                  selectedObj.content
                }
                onChange={(event) => {
                  const next =
                    JSON.parse(
                      JSON.stringify(
                        selectedObj
                      )
                    );

                  next.content =
                    event.target.value;

                  updateObj(next);
                }}
              />
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  '1fr 1fr',
                gap: 6
              }}
            >
              <Num
                label="X"
                value={
                  selectedObj.style.x
                }
                onChange={(value) =>
                  updateField(
                    'x',
                    value
                  )
                }
              />

              <Num
                label="Y"
                value={
                  selectedObj.style.y
                }
                onChange={(value) =>
                  updateField(
                    'y',
                    value
                  )
                }
              />

              <Num
                label="W"
                value={
                  selectedObj.style.w
                }
                onChange={(value) =>
                  updateField(
                    'w',
                    value
                  )
                }
              />

              <Num
                label="H"
                value={
                  selectedObj.style.h
                }
                onChange={(value) =>
                  updateField(
                    'h',
                    value
                  )
                }
              />

              <Num
                label="Rotate"
                value={
                  selectedObj.style
                    .rotation
                }
                onChange={(value) =>
                  updateField(
                    'rotation',
                    value
                  )
                }
              />

              <Num
                label="Zoom"
                value={
                  selectedObj.style
                    .zoom || 1
                }
                step={0.1}
                onChange={(value) =>
                  updateField(
                    'zoom',
                    value
                  )
                }
              />
            </div>

            {(
              [
                'title',
                'subtitle',
                'text',
                'bullet_list'
              ] as string[]
            ).includes(
              selectedObj.type
            ) && (
              <div
                className="card"
                style={{
                  padding: 10
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 12,
                    marginBottom: 8
                  }}
                >
                  Text & point styling
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      '1fr 1fr',
                    gap: 6
                  }}
                >
                  <Num
                    label="Font size"
                    value={
                      selectedObj.style
                        .fontSize
                    }
                    onChange={(value) =>
                      updateField(
                        'fontSize',
                        Math.max(
                          8,
                          Math.min(
                            120,
                            value
                          )
                        )
                      )
                    }
                  />

                  <label>
                    Color
                    <input
                      className="input"
                      type="color"
                      value={
                        selectedObj
                          .style.color ||
                        '#f5f5f7'
                      }
                      onChange={(
                        event
                      ) =>
                        updateField(
                          'color',
                          event.target.value
                        )
                      }
                    />
                  </label>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 6,
                    flexWrap:
                      'wrap',
                    marginTop: 8
                  }}
                >
                  <button
                    className={`btn ${
                      selectedObj
                        .style.bold
                        ? 'btn-primary'
                        : ''
                    }`}
                    onClick={() =>
                      updateField(
                        'bold',
                        !selectedObj
                          .style.bold
                      )
                    }
                  >
                    Bold
                  </button>

                  <button
                    className={`btn ${
                      selectedObj
                        .style.italic
                        ? 'btn-primary'
                        : ''
                    }`}
                    onClick={() =>
                      updateField(
                        'italic',
                        !selectedObj
                          .style.italic
                      )
                    }
                  >
                    Italic
                  </button>

                  <button
                    className={`btn ${
                      selectedObj
                        .style
                        .underline
                        ? 'btn-primary'
                        : ''
                    }`}
                    onClick={() =>
                      updateField(
                        'underline',
                        !selectedObj
                          .style
                          .underline
                      )
                    }
                  >
                    Underline
                  </button>

                  <select
                    className="input"
                    style={{
                      width: 120
                    }}
                    value={
                      selectedObj.style
                        .align ||
                      'left'
                    }
                    onChange={(event) =>
                      updateField(
                        'align',
                        event.target.value
                      )
                    }
                  >
                    <option value="left">
                      Left
                    </option>
                    <option value="center">
                      Center
                    </option>
                    <option value="right">
                      Right
                    </option>
                    <option value="justify">
                      Justify
                    </option>
                  </select>
                </div>

                <div
                  style={{
                    fontSize: 11,
                    color:
                      'var(--text-dim)',
                    marginTop: 7
                  }}
                >
                  These controls apply
                  to the selected heading,
                  paragraph, or all points
                  in the selected bullet
                  block.
                </div>
              </div>
            )}

            {selectedObj.type ===
              'bullet_list' && (
              <textarea
                className="input"
                rows={6}
                placeholder="One point per line"
                value={(
                  selectedObj.data
                    ?.items || []
                ).join('\n')}
                onChange={(event) => {
                  const next =
                    JSON.parse(
                      JSON.stringify(
                        selectedObj
                      )
                    );

                  next.data = {
                    ...(next.data || {}),
                    items:
                      event.target.value
                        .split(/\n/)
                        .filter(Boolean)
                  };

                  updateObj(next);
                }}
              />
            )}

            <div
              style={{
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap'
              }}
            >
              <button
                className="btn"
                onClick={() =>
                  manual(
                    selectedObj
                      .style
                      .highlighted
                      ? 'unhighlight'
                      : 'highlight'
                  )
                }
              >
                {selectedObj.style
                  .highlighted
                  ? 'Unhighlight'
                  : 'Highlight'}
              </button>

              <button
                className="btn"
                onClick={() =>
                  manual(
                    selectedObj
                      .style.hidden
                      ? 'show'
                      : 'hide'
                  )
                }
              >
                {selectedObj.style
                  .hidden
                  ? 'Show'
                  : 'Hide'}
              </button>

              <button
                className="btn"
                onClick={() =>
                  manual(
                    'duplicate this'
                  )
                }
              >
                Duplicate
              </button>

              <button
                className="btn"
                onClick={() =>
                  manual(
                    'delete this'
                  )
                }
              >
                Delete
              </button>
            </div>

            {selectedObj.type ===
              'image' && (
              <div
                className="card"
                style={{
                  padding: 10
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 12,
                    marginBottom: 8
                  }}
                >
                  Image crop
                </div>

                <Range
                  label="Crop left"
                  value={
                    selectedObj.data
                      .crop?.x || 0
                  }
                  onChange={(value) =>
                    updateCrop(
                      'x',
                      value
                    )
                  }
                />

                <Range
                  label="Crop top"
                  value={
                    selectedObj.data
                      .crop?.y || 0
                  }
                  onChange={(value) =>
                    updateCrop(
                      'y',
                      value
                    )
                  }
                />

                <Range
                  label="Crop width"
                  value={
                    selectedObj.data
                      .crop?.w || 100
                  }
                  onChange={(value) =>
                    updateCrop(
                      'w',
                      value
                    )
                  }
                  min={10}
                />

                <Range
                  label="Crop height"
                  value={
                    selectedObj.data
                      .crop?.h || 100
                  }
                  onChange={(value) =>
                    updateCrop(
                      'h',
                      value
                    )
                  }
                  min={10}
                />

                <div
                  style={{
                    fontSize: 11,
                    color:
                      'var(--text-dim)',
                    marginTop: 6
                  }}
                >
                  Drag the image to place
                  it. Drag the blue corner
                  handle to resize. Voice
                  commands can also control
                  it.
                </div>
              </div>
            )}
          </div>
        ) : (
          <div
            style={{
              fontSize: 13,
              color:
                'var(--text-dim)'
            }}
          >
            Select any object. Images are
            real editable objects, not
            flattened placeholders.
          </div>
        )}

        {/* SPEAKER NOTES */}
        <div
          style={{
            marginTop: 22
          }}
        >
          <div
            style={{
              fontWeight: 700,
              marginBottom: 8
            }}
          >
            Speaker notes
          </div>

          <textarea
            className="input"
            rows={5}
            value={
              slide?.speakerNotes || ''
            }
            onChange={(event) => {
              const next = clone();

              const targetSlide =
                next.slides.find(
                  (s) =>
                    s.id ===
                    currentSlideId
                );

              if (!targetSlide) return;

              targetSlide.speakerNotes =
                event.target.value;

              updatePresentation(next);
            }}
          />

          <button
            className="btn"
            style={{
              marginTop: 8,
              width: '100%'
            }}
            onClick={generateNotes}
            disabled={notesLoading}
          >
            {notesLoading
              ? 'Generating…'
              : '✨ Generate with AI'}
          </button>
        </div>

        {/* VERSION HISTORY */}
        {versions.length > 0 && (
          <div
            style={{
              marginTop: 22
            }}
          >
            <div
              style={{
                fontWeight: 700,
                marginBottom: 8
              }}
            >
              Version history
            </div>

            {versions.map(
              (version) => (
                <div
                  key={version.id}
                  style={{
                    fontSize: 11,
                    color:
                      'var(--text-dim)',
                    padding:
                      '6px 0',
                    borderBottom:
                      '1px solid var(--border)',
                    display: 'flex',
                    justifyContent:
                      'space-between'
                  }}
                >
                  <span>
                    {new Date(
                      version.created_at
                    ).toLocaleString()}
                  </span>

                  <span
                    style={{
                      color:
                        'var(--accent)',
                      cursor:
                        'pointer'
                    }}
                    onClick={() =>
                      api
                        .restoreVersion(
                          id!,
                          version.id
                        )
                        .then(
                          (
                            restored
                          ) => {
                            setPresentation(
                              restored
                            );

                            setCurrentSlideId(
                              restored
                                .slides[0]
                                ?.id || ''
                            );
                          }
                        )
                    }
                  >
                    Restore
                  </span>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Num({
  label,
  value,
  onChange,
  step = 1
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
}) {
  return (
    <label
      style={{
        fontSize: 10,
        color: 'var(--text-dim)'
      }}
    >
      {label}

      <input
        className="input"
        type="number"
        step={step}
        value={
          Number.isFinite(value)
            ? value
            : 0
        }
        onChange={(event) =>
          onChange(
            Number(event.target.value)
          )
        }
      />
    </label>
  );
}

function Range({
  label,
  value,
  onChange,
  min = 0,
  max = 100
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label
      style={{
        display: 'block',
        fontSize: 10,
        color: 'var(--text-dim)',
        marginBottom: 6
      }}
    >
      {label}

      <input
        style={{ width: '100%' }}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) =>
          onChange(
            Number(event.target.value)
          )
        }
      />

      <span>
        {Math.round(value)}%
      </span>
    </label>
  );
}

function ExportMenu({
  id
}: {
  id: string;
}) {
  const [open, setOpen] =
    useState(false);

  return (
    <div
      style={{
        position: 'relative'
      }}
    >
      <button
        className="btn"
        onClick={() =>
          setOpen((v) => !v)
        }
      >
        Export ▾
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 40,
            right: 0,
            background:
              'var(--graphite)',
            border:
              '1px solid var(--border)',
            borderRadius: 10,
            padding: 8,
            zIndex: 30,
            width: 170
          }}
        >
          {(
            [
              'pptx',
              'pdf',
              'transcript',
              'json'
            ] as const
          ).map((format) => (
            <a
              key={format}
              href={api.exportUrl(
                id,
                format
              )}
              style={{
                display: 'block',
                padding:
                  '8px 10px',
                fontSize: 13
              }}
            >
              {format.toUpperCase()}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}