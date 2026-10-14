using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;

public static class Repo
{
    /// <summary>The repository's root (where package.json is), found from the running test.</summary>
    public static string Root
    {
        get
        {
            var d = new DirectoryInfo(System.AppContext.BaseDirectory);
            while (d != null && !File.Exists(Path.Combine(d.FullName, "package.json"))) d = d.Parent;
            return d?.FullName ?? Directory.GetCurrentDirectory();
        }
    }
}

/// <summary>
/// Where two JSON values first differ (null if they are alike). Unset and false and empty are alike: the two engines
/// may leave a flag unset where the other sets it false, or an empty list where the other has none.
/// </summary>
public static class JsonDiff
{
    static bool Blank(JToken t) =>
        t == null || t.Type == JTokenType.Null || t.Type == JTokenType.Undefined || (t.Type == JTokenType.Boolean && !(bool)t)
        || (t is JArray a && a.Count == 0) || (t is JObject o && !o.Properties().Any(p => !Blank(p.Value)));

    public static string First(JToken a, JToken b, string path = "$")
    {
        if (Blank(a) && Blank(b)) return null;
        if (a is JObject oa && b is JObject ob)
        {
            foreach (var k in oa.Properties().Select(p => p.Name).Union(ob.Properties().Select(p => p.Name)))
            {
                var d = First(oa[k], ob[k], $"{path}.{k}");
                if (d != null) return d;
            }
            return null;
        }
        if (a is JArray aa && b is JArray ab)
        {
            if (aa.Count != ab.Count) return $"{path}: {aa.Count} items vs {ab.Count}";
            for (int i = 0; i < aa.Count; i++)
            {
                var d = First(aa[i], ab[i], $"{path}[{i}]");
                if (d != null) return d;
            }
            return null;
        }
        if (a != null && b != null && (a.Type == JTokenType.Integer || a.Type == JTokenType.Float) && (b.Type == JTokenType.Integer || b.Type == JTokenType.Float))
            return System.Math.Abs((double)a - (double)b) < 1e-9 ? null : $"{path}: {a} vs {b}";
        return JToken.DeepEquals(a, b) ? null : $"{path}: {Trim(a)} vs {Trim(b)}";
    }

    static string Trim(JToken t)
    {
        var s = t?.ToString(Newtonsoft.Json.Formatting.None) ?? "(unset)";
        return s.Length > 160 ? s.Substring(0, 160) + "…" : s;
    }
}
