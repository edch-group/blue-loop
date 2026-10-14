using UnityEditor;

/// <summary>
/// How the baked pictures import: the glossary's pages (tall, full of small words) at their own size, never shrunk to
/// the default 2048 or blurred by mipmaps; the card faces and art without mipmaps, as they are drawn near their size.
/// </summary>
public class ImportRules : AssetPostprocessor
{
    void OnPreprocessTexture()
    {
        var t = (TextureImporter)assetImporter;
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
