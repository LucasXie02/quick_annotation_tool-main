interface InstructionsPanelProps {
  language: 'en' | 'zh';
  onLanguageChange(lang: 'en' | 'zh'): void;
}

const englishSteps = [
  'Load an image with Upload Image or scan a folder from the Dataset panel.',
  'Choose a tool (Select, BBox, Polygon, Rotated BBox, Area Clone) before drawing.',
  'Drag to draw/edit shapes and use the Object list to rename, copy, or delete them.',
  'Area Clone copies everything inside the marquee into a brand-new group.',
  'Undo plus Center & Fit in the View card quickly fix mistakes or recenter the canvas.',
  'Scroll to zoom; with the Select tool active you can drag the empty canvas to pan.',
  'Easy tricks: double-click to finish polygons and fine-tune rotated boxes via the Width/Height inputs.'
];

const chineseSteps = [
  '通过“上传图像”或“数据集”面板加载单张图像或整批文件。',
  '绘制前选择工具（选择、矩形、多边形、旋转框、区域克隆）。',
  '拖拽绘制并在“对象”列表中重命名、复制或删除标注。',
  '“区域克隆”可一次复制框选内的所有标注到新分组。',
  '在“视图”卡片使用“撤销”“居中&适配”即可快速修正或回到图像中心。',
  '滚轮缩放；处于“选择”工具时拖拽空白画布即可平移视图。',
  '小技巧：双击快速结束多边形，旋转框可用宽/高输入框精确调整尺寸。'
];

export function InstructionsPanel({ language, onLanguageChange }: InstructionsPanelProps) {
  const instructions = language === 'en' ? englishSteps : chineseSteps;

  return (
    <div className="instructions-panel">
      <div className="instructions-header">
        <h3>Instructions</h3>
        <select value={language} onChange={(event) => onLanguageChange(event.target.value as 'en' | 'zh')}>
          <option value="en">EN</option>
          <option value="zh">中文</option>
        </select>
      </div>
      <ol>
        {instructions.map((step, idx) => (
          <li key={idx}>{step}</li>
        ))}
      </ol>
    </div>
  );
}

export default InstructionsPanel;
