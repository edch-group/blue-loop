using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;

namespace BlueLoop.Engine
{
    /// <summary>JSON as the TypeScript engine writes it: camelCase names, unset fields left out.</summary>
    public static class Json
    {
        public static readonly JsonSerializerSettings Settings = new JsonSerializerSettings
        {
            ContractResolver = new DefaultContractResolver { NamingStrategy = new CamelCaseNamingStrategy { ProcessDictionaryKeys = false } },
            NullValueHandling = NullValueHandling.Ignore,
        };

        public static string Write(object o, bool indented = false) => JsonConvert.SerializeObject(o, indented ? Formatting.Indented : Formatting.None, Settings);

        public static T Read<T>(string json) => JsonConvert.DeserializeObject<T>(json, Settings);

        /// <summary>A deep copy (through JSON: the engine's state is plain data).</summary>
        public static T Clone<T>(T o) => Read<T>(Write(o));
    }
}
