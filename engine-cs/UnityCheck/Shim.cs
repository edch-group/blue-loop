// Stand-ins for com.unity.ugui 2.0 (UI and TextMeshPro), for type-checking only.
using UnityEngine;
using UnityEngine.Events;

namespace UnityEngine.EventSystems
{
    public class UIBehaviour : MonoBehaviour { }
    public class EventSystem : UIBehaviour { public static EventSystem current; public bool IsPointerOverGameObject() => false; public bool IsPointerOverGameObject(int id) => false; public GameObject currentSelectedGameObject; public void SetSelectedGameObject(GameObject g) { } }
    public class StandaloneInputModule : UIBehaviour { }
    public class BaseEventData { }
    public enum PointerInputButton { Left, Right, Middle }
    public class PointerEventData : BaseEventData { public Vector2 position, delta; public int pointerId; public PointerInputButton button; public GameObject pointerEnter, pointerPress; public Camera pressEventCamera, enterEventCamera; public bool dragging; public int clickCount; public enum InputButton { Left, Right, Middle } }
    public interface IEventSystemHandler { }
    public interface IPointerClickHandler : IEventSystemHandler { void OnPointerClick(PointerEventData e); }
    public interface IPointerDownHandler : IEventSystemHandler { void OnPointerDown(PointerEventData e); }
    public interface IPointerUpHandler : IEventSystemHandler { void OnPointerUp(PointerEventData e); }
    public interface IPointerEnterHandler : IEventSystemHandler { void OnPointerEnter(PointerEventData e); }
    public interface IPointerExitHandler : IEventSystemHandler { void OnPointerExit(PointerEventData e); }
    public interface IDragHandler : IEventSystemHandler { void OnDrag(PointerEventData e); }
    public interface IBeginDragHandler : IEventSystemHandler { void OnBeginDrag(PointerEventData e); }
    public interface IEndDragHandler : IEventSystemHandler { void OnEndDrag(PointerEventData e); }
    public interface IInitializePotentialDragHandler : IEventSystemHandler { void OnInitializePotentialDrag(PointerEventData e); }
    public enum EventTriggerType { PointerEnter, PointerExit, PointerDown, PointerUp, PointerClick, Drag, Drop, Scroll }
    public class EventTrigger : MonoBehaviour { public class TriggerEvent : UnityEvent<BaseEventData> { } public class Entry { public EventTriggerType eventID; public TriggerEvent callback = new TriggerEvent(); } public System.Collections.Generic.List<Entry> triggers = new System.Collections.Generic.List<Entry>(); }
    public interface IScrollHandler : IEventSystemHandler { void OnScroll(PointerEventData e); }
}

namespace UnityEngine.UI
{
    using UnityEngine.EventSystems;
    public class VertexHelper { public int currentVertCount; public void Clear() { } public void AddVert(Vector3 p, Color32 c, Vector4 uv) { } public void AddVert(UIVertex v) { } public void AddTriangle(int a, int b, int c) { } public void AddUIVertexQuad(UIVertex[] q) { } }
        public abstract class Graphic : UIBehaviour { public Color color; public bool raycastTarget; public virtual Material material { get; set; } public RectTransform rectTransform => null; public Canvas canvas; public void SetVerticesDirty() { } public void SetMaterialDirty() { } public void SetAllDirty() { } public virtual void CrossFadeAlpha(float a, float d, bool i) { } public virtual void CrossFadeColor(Color c, float d, bool i, bool a) { } protected virtual void OnPopulateMesh(VertexHelper vh) { } public virtual Texture mainTexture => null; public Material materialForRendering => null; public virtual Material defaultMaterial => null; public Vector4 raycastPadding; }
    public abstract class MaskableGraphic : Graphic { public bool maskable; }
    public class Image : MaskableGraphic { public enum Type { Simple, Sliced, Tiled, Filled } public enum FillMethod { Horizontal, Vertical, Radial90, Radial180, Radial360 } public Sprite sprite; public Type type; public bool preserveAspect; public float fillAmount; public FillMethod fillMethod; public int fillOrigin; public bool fillClockwise; public float pixelsPerUnitMultiplier; public enum Origin360 { Bottom, Right, Top, Left } public void SetNativeSize() { } }
    public class RawImage : MaskableGraphic { public Texture texture; public Rect uvRect; public void SetNativeSize() { } }
    public class Text : MaskableGraphic { public string text; public Font font; public int fontSize; public TextAnchor alignment; }
    public struct ColorBlock { public Color normalColor, highlightedColor, pressedColor, selectedColor, disabledColor; public float colorMultiplier, fadeDuration; public static ColorBlock defaultColorBlock; }
    public struct Navigation { public enum Mode { None, Horizontal, Vertical, Automatic, Explicit } public Mode mode; public static Navigation defaultNavigation; }
    public class Selectable : UIBehaviour { public enum Transition { None, ColorTint, SpriteSwap, Animation } public Transition transition; public bool interactable; public Graphic targetGraphic; public ColorBlock colors; public Navigation navigation; public virtual void Select() { } }
    public class Button : Selectable { public class ButtonClickedEvent : UnityEvent { } public ButtonClickedEvent onClick = new ButtonClickedEvent(); }
    public class Toggle : Selectable { public bool isOn; public UnityEvent<bool> onValueChanged; }
    public class ScrollRect : UIBehaviour { public enum MovementType { Unrestricted, Elastic, Clamped } public enum ScrollbarVisibility { Permanent, AutoHide, AutoHideAndExpandViewport } public RectTransform content, viewport; public bool horizontal, vertical, inertia; public MovementType movementType; public float scrollSensitivity, decelerationRate, elasticity; public Vector2 normalizedPosition, velocity; public float verticalNormalizedPosition, horizontalNormalizedPosition; public UnityEvent<Vector2> onValueChanged = new UnityEvent<Vector2>(); public void StopMovement() { } }
    public class Mask : UIBehaviour { public bool showMaskGraphic; }
    public class RectMask2D : UIBehaviour { public Vector4 padding; public Vector2Int softness; }
    public class BaseMeshEffect : UIBehaviour { }
    public class Shadow : BaseMeshEffect { public Color effectColor; public Vector2 effectDistance; public bool useGraphicAlpha; }
    public class Outline : Shadow { }
    public class CanvasScaler : UIBehaviour { public enum ScaleMode { ConstantPixelSize, ScaleWithScreenSize, ConstantPhysicalSize } public enum ScreenMatchMode { MatchWidthOrHeight, Expand, Shrink } public ScaleMode uiScaleMode; public Vector2 referenceResolution; public ScreenMatchMode screenMatchMode; public float matchWidthOrHeight, scaleFactor, referencePixelsPerUnit; }
    public class GraphicRaycaster : UIBehaviour { public bool ignoreReversedGraphics; }
    public static class LayoutRebuilder { public static void ForceRebuildLayoutImmediate(RectTransform r) { } }
}

namespace TMPro
{
    using UnityEngine.UI;
    public enum TextAlignmentOptions { TopLeft, Top, TopRight, TopJustified, Left, Center, Right, Justified, BottomLeft, Bottom, BottomRight, BaselineLeft, Baseline, BaselineRight, MidlineLeft, Midline, MidlineRight, CaplineLeft, Capline, CaplineRight, TopGeoAligned, CenterGeoAligned, Flush }
    public enum TextWrappingModes { NoWrap, Normal, PreserveWhitespace, PreserveWhitespaceNoWrap }
    public enum TextOverflowModes { Overflow, Ellipsis, Masking, Truncate, ScrollRect, Page, Linked }
    [System.Flags] public enum FontStyles { Normal = 0, Bold = 1, Italic = 2, Underline = 4, LowerCase = 8, UpperCase = 16, SmallCaps = 32, Strikethrough = 64, Superscript = 128, Subscript = 256, Highlight = 512 }
    public enum FontWeight { Thin = 100, ExtraLight = 200, Light = 300, Regular = 400, Medium = 500, SemiBold = 600, Bold = 700, Heavy = 800, Black = 900 }
    public enum AtlasPopulationMode { Static, Dynamic, DynamicOS }
    public enum TextureMappingOptions { Character, Line, Paragraph, MatchAspect }
    public class TMP_Asset : ScriptableObject { }
    public class TMP_FontWeightPair { public TMP_FontAsset regularTypeface, italicTypeface; }
    public class FaceInfo { public float lineHeight, pointSize, ascentLine, descentLine; }
    public class TMP_FontAsset : TMP_Asset
    {
        public static TMP_FontAsset CreateFontAsset(Font f) => null;
        public static TMP_FontAsset CreateFontAsset(Font f, int size, int padding, UnityEngine.TextCore.LowLevel.GlyphRenderMode mode, int w, int h, AtlasPopulationMode pop = AtlasPopulationMode.Dynamic, bool multi = true) => null;
        public System.Collections.Generic.List<TMP_FontAsset> fallbackFontAssetTable;
        public TMP_FontWeightPair[] fontWeightTable;
        public Material material;
        public bool isMultiAtlasTexturesEnabled;
        public AtlasPopulationMode atlasPopulationMode;
        public bool HasCharacter(char c, bool searchFallbacks = false, bool tryAddCharacter = false) => true;
        public bool TryAddCharacters(string s) => true;
        public bool TryAddCharacters(string s, out string missing) { missing = ""; return true; }
        public UnityEngine.TextCore.FaceInfo faceInfo;
    }
    public class TMP_TextInfo { public int characterCount, lineCount; public TMP_CharacterInfo[] characterInfo; public TMP_LineInfo[] lineInfo; }
    public struct TMP_CharacterInfo { public char character; public bool isVisible; public Vector3 bottomLeft, topRight, topLeft, bottomRight; public int lineNumber, materialReferenceIndex, vertexIndex; public float ascender, descender, baseLine; }
    public struct TMP_LineInfo { public float ascender, descender, baseline, width, length; public int firstCharacterIndex, lastCharacterIndex, characterCount; }
    public abstract class TMP_Text : MaskableGraphic
    {
        public string text;
        public TMP_FontAsset font;
        public float fontSize, fontSizeMin, fontSizeMax, characterSpacing, lineSpacing, wordSpacing, paragraphSpacing, outlineWidth;
        public bool enableAutoSizing, richText, isOverlay, extraPadding, enableKerning, parseCtrlCharacters;
        public TextAlignmentOptions alignment;
        public TextWrappingModes textWrappingMode;
        public TextOverflowModes overflowMode;
        public FontStyles fontStyle;
        public FontWeight fontWeight;
        public Vector4 margin;
        public Color faceColor, outlineColor;
        public Material fontSharedMaterial, fontMaterial;
        public float preferredWidth, preferredHeight;
        public Bounds textBounds, bounds;
        public TMP_TextInfo textInfo;
        public int maxVisibleCharacters, maxVisibleLines, firstVisibleCharacter, pageToDisplay;
        public float alpha;
        public bool isTextOverflowing;
        public Vector2 GetPreferredValues() => default;
        public Vector2 GetPreferredValues(string t) => default;
        public Vector2 GetPreferredValues(float w, float h) => default;
        public Vector2 GetPreferredValues(string t, float w, float h) => default;
        public void ForceMeshUpdate(bool ignoreActiveState = false, bool forceTextReparsing = false) { }
        public void SetText(string t) { }
        public void UpdateMeshPadding() { }
        public TMP_TextInfo GetTextInfo(string t) => null;
        public Mesh mesh;
        public UnityEngine.UI.Image dummy;
        public void UpdateVertexData() { }
    }
    public class TextMeshPro : TMP_Text { public int sortingOrder; public new Renderer renderer; public float autoSizeTextContainer; }
    public class TextMeshProUGUI : TMP_Text { }
    public class TMP_InputField : Selectable
    {
        public enum ContentType { Standard, Autocorrected, IntegerNumber, DecimalNumber, Alphanumeric, Name, EmailAddress, Password, Pin, Custom }
        public enum LineType { SingleLine, MultiLineSubmit, MultiLineNewline }
        public class SubmitEvent : UnityEvent<string> { }
        public class OnChangeEvent : UnityEvent<string> { }
        public class SelectionEvent : UnityEvent<string> { }
        public string text;
        public TMP_Text textComponent;
        public Graphic placeholder;
        public RectTransform textViewport;
        public ContentType contentType;
        public LineType lineType;
        public int characterLimit, caretWidth, caretPosition;
        public Color caretColor, selectionColor;
        public bool readOnly, customCaretColor, richText, isFocused, onFocusSelectAll, resetOnDeActivation, restoreOriginalTextOnEscape, shouldHideMobileInput;
        public float pointSize, caretBlinkRate;
        public TMP_FontAsset fontAsset;
        public SubmitEvent onSubmit = new SubmitEvent(), onEndEdit = new SubmitEvent();
        public OnChangeEvent onValueChanged = new OnChangeEvent();
        public SelectionEvent onSelect = new SelectionEvent(), onDeselect = new SelectionEvent();
        public System.Func<string, int, char, char> onValidateInput;
        public void ActivateInputField() { }
        public void DeactivateInputField(bool clearSelection = false) { }
        public void SetTextWithoutNotify(string t) { }
        public void ForceLabelUpdate() { }
    }
    public class TMP_Settings { public static TMP_FontAsset defaultFontAsset; }
}
