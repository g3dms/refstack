import { Stage, Layer, Circle, Image as KImage, Transformer } from 'react-konva';
import { useRef, useState, useEffect } from 'react';
import useImage from 'use-image';

// Pre-generate grid dots: generate coordinates from -2000 to 2000, every 40 pxs, set it in an array where each element is [x, y]
const gridDots = [];
const spacing = 40;
const range = 2000;
for (let gx = -range; gx <= range; gx += spacing) {
  for (let gy = -range; gy <= range; gy += spacing) {
    gridDots.push({ x: gx, y: gy });
  }
}

// Photo: draws ONE image item, and shows a Transformer when selected
//
// An item looks like:
// { id, src, x, y, width, height, scaleX, scaleY, rotation }
// x/y is the CENTRE of the image (because of offsetX/offsetY below),
// so flipping (negative scaleX) happens around the middle.
// ---------------------------------------------------------------
function Photo({ item, isSelected, onSelect, onChange }) {
  const [img] = useImage(item.src);   // loads the image from its URL
  const shapeRef = useRef(null);      // the real Konva image node
  const trRef = useRef(null);         // the real Konva transformer

  // After a render where we're selected, attach the transformer to the node
  useEffect(() => {
    if (isSelected && trRef.current && shapeRef.current) {
      trRef.current.nodes([shapeRef.current]);
      trRef.current.getLayer().batchDraw();
    }
  }, [isSelected]);

  return (
    <>
      <KImage
        ref={shapeRef}
        image={img}
        x={item.x}
        y={item.y}
        width={item.width}
        height={item.height}
        offsetX={item.width / 2}
        offsetY={item.height / 2}
        scaleX={item.scaleX}
        scaleY={item.scaleY}
        rotation={item.rotation}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => onChange({ x: e.target.x(), y: e.target.y() })}
        onTransformEnd={() => {
          const n = shapeRef.current;
          onChange({
            x: n.x(),
            y: n.y(),
            scaleX: n.scaleX(),
            scaleY: n.scaleY(),
            rotation: n.rotation(),
          });
        }}
      />
      {isSelected && <Transformer ref={trRef} />}
    </>
  );
}



function App() {
  // Changing it does not rerender
  // When you need to talk to the real canvas object, you use a ref. When you need something to show on screen, you use state.
  const stageRef = useRef(null);

  // sets everything on the canvas
  const [items, setItems] = useState([]);          
  const [selectedId, setSelectedId] = useState(null);

  const W = window.innerWidth;
  const H = window.innerHeight;
  const scaleBy = 1.15;

  // screen position -> canvas position (accounts for zoom + pan)
  function toCanvas(p) {
    const stage = stageRef.current;
    return stage.getAbsoluteTransform().copy().invert().point(p);
  }

  // change some fields of one item, leave the rest alone
  function updateItem(id, patch) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function handleWheel(e) {

    // prevents scroll
    e.evt.preventDefault();

    // grabs konva stage from ref
    const stage = stageRef.current;

    // current scale
    const oldScale = stage.scaleX();

    // mouse coords on screen
    const pointer = stage.getPointerPosition();

    // mouse coords on canvas
    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    };

    
    let direction = e.evt.deltaY > 0 ? -1 : 1;
    if (e.evt.ctrlKey) direction = -direction;

    let newScale = direction > 0 ? oldScale / scaleBy : oldScale * scaleBy;

    // clamps scale from 10% to 1000%
    // Math.min(10, x) means "no bigger than 10", and Math.max(0.1, x) means "no smaller than 0.1"
    newScale = Math.max(0.1, Math.min(10, newScale));

    stage.scale({ x: newScale, y: newScale });
    stage.position({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  }

  // adding images
  function addImageFile(file, center) {
    const src = URL.createObjectURL(file);

    // used to learn the image's size
    const probe = new window.Image();
    probe.onload = () => {

      // shrink wide images, never enlarge
      const s = Math.min(1, 400 / probe.width);
      const id = crypto.randomUUID();
      setItems((prev) => [
        ...prev,
        {
          id,
          src,
          x: center.x,
          y: center.y,
          width: probe.width,
          height: probe.height,
          scaleX: s,
          scaleY: s,
          rotation: 0,
        },
      ]);
      setSelectedId(id);
    };
    probe.src = src;
  }

  // drop
  function handleDrop(e) {
    e.preventDefault();
    const stage = stageRef.current;

    // tell Konva where the mouse was
    stage.setPointersPositions(e.nativeEvent);      
    const pos = toCanvas(stage.getPointerPosition());
    for (const file of Array.from(e.dataTransfer.files)) {
      if (file.type.startsWith('image/')) addImageFile(file, pos);
    }
  }

  // paste
  useEffect(() => {
    function onPaste(e) {
      const center = toCanvas({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      for (const file of Array.from(e.clipboardData?.files ?? [])) {
        if (file.type.startsWith('image/')) addImageFile(file, center);
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // delete / flip
  useEffect(() => {
    function onKey(e) {
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!selectedId) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        setItems((prev) => prev.filter((it) => it.id !== selectedId));
        setSelectedId(null);
      }
      if (e.key.toLowerCase() === 'f') {
        setItems((prev) =>
          prev.map((it) => (it.id === selectedId ? { ...it, scaleX: -it.scaleX } : it))
        );
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  return (
    <div
      onDragOver={(e) => e.preventDefault()} 
      onDrop={handleDrop}
      style={{ width: '100vw', height: '100vh', background: '#2b2b2b' }}
    >
      <Stage
        ref={stageRef}
        width={W}
        height={H}
        draggable
        onWheel={handleWheel}
        onMouseDown={(e) => {
          // clicked empty space (the stage itself) -> deselect
          if (e.target === e.target.getStage()) setSelectedId(null);
        }}
      >
        <Layer>
          {gridDots.map((d, i) => (
            <Circle key={'g' + i} x={d.x} y={d.y} radius={1} fill="#666" listening={false} />
          ))}

          {items.map((item) => (
            <Photo
              key={item.id}
              item={item}
              isSelected={item.id === selectedId}
              onSelect={() => setSelectedId(item.id)}
              onChange={(patch) => updateItem(item.id, patch)}
            />
          ))}
        </Layer>
      </Stage>
    </div>
  );
}

export default App;