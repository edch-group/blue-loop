using UnityEditor;

/// <summary>
/// How the baked pictures import: the glossary's pages (tall, full of small words) at their own size, never shrunk to
/// the default 2048 or blurred by mipmaps; the card faces and art without mipmaps, as they are drawn near their size; the
/// Captain's ship's paint as data.
/// </summary>
public class ImportRules : AssetPostprocessor
{
    void OnPreprocessTexture()
    {
        var t = (TextureImporter)assetImporter;
        // (The baked marks: their see-through pixels' colour bled from their edges, so fine white lines stay white.)
        if (assetPath.Contains("/Resources/Icons/")) t.alphaIsTransparency = true;
        // (The Captain's ship's paint: read as it was painted, not as a colour to be lit, and never wrapped round.)
        if (assetPath.Contains("/Resources/Models/"))
        {
            t.sRGBTexture = false;
            t.wrapMode = UnityEngine.TextureWrapMode.Clamp;
            t.alphaIsTransparency = false;
            t.npotScale = TextureImporterNPOTScale.None;
            t.textureCompression = TextureImporterCompression.CompressedHQ;
            t.isReadable = false;
        }
        if (assetPath.Contains("/Resources/Glossary/"))
        {
            t.maxTextureSize = 8192;
            t.mipmapEnabled = false;
            t.npotScale = TextureImporterNPOTScale.None;
            t.textureCompression = TextureImporterCompression.CompressedHQ;
            t.isReadable = false;
        }
    }
}
