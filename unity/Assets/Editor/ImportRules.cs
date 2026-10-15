using UnityEditor;

/// <summary>
/// How the baked pictures import: the glossary's pictures (drawn far smaller than they are) smooth with their mipmaps;
/// the card faces and art without mipmaps, as they are drawn near their size; the Captain's ship's texture as data.
/// </summary>
public class ImportRules : AssetPostprocessor
{
    void OnPreprocessTexture()
    {
        var t = (TextureImporter)assetImporter;
        // (The baked marks: their see-through pixels' colour bled from their edges, so fine white lines stay white.)
        if (assetPath.Contains("/Resources/Icons/")) t.alphaIsTransparency = true;
        // (The Captain's ship's texture: its colours as Meshy painted them, read as they are; its glow in alpha; smooth
        // however far off it is seen.)
        if (assetPath.Contains("/Resources/Models/"))
        {
            t.sRGBTexture = false;
            t.alphaIsTransparency = false;
            t.wrapMode = UnityEngine.TextureWrapMode.Clamp;
            t.mipmapEnabled = true;
            t.anisoLevel = 4;
            // (The Captain's own at 4K: seen close beside his skill tree, his eyes are a few of its pixels.)
            t.maxTextureSize = assetPath.EndsWith("CaptainColour.jpg") ? 4096 : 2048;
            t.textureCompression = TextureImporterCompression.CompressedHQ;
            t.isReadable = false;
        }
        if (assetPath.Contains("/Resources/Glossary/"))
        {
            t.maxTextureSize = 2048;
            t.mipmapEnabled = true;
            t.npotScale = TextureImporterNPOTScale.None;
            t.textureCompression = TextureImporterCompression.CompressedHQ;
            t.isReadable = false;
        }
    }
}
