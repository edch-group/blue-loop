using System.Collections.Generic;
using BlueLoop.Engine;
using Newtonsoft.Json.Linq;

/// <summary>
/// The economy's changes (account.ts economyCall): a booster, crafting, breaking down. Asked of the server, which keeps
/// the account's economy (server/accounts.ts /api/booster, /api/craft, /api/breakdown); the profile here takes up its
/// answer. With no server (Net.Available false), made here instead, against this device's profile, as the server
/// would (server/economy.ts).
/// </summary>
public static class EconomyCalls
{
    /// <summary>No server to ask: the economy is this device's.</summary>
    public static bool Local => !Net.Available;

    static void Call(string path, JObject payload, System.Action<Net.Reply> done)
    {
        Net.Api(path, "POST", payload, r =>
        {
            if (r.Ok && r.Data["economy"] is JObject e)
            {
                Account.Economy economy = null;
                try { economy = Json.Read<Account.Economy>(e.ToString()); }
                catch { }
                Profile.SetEconomy(economy);
            }
            done(r);
        });
    }

    /// <summary>Buy and open a booster: its cards, or why not.</summary>
    public static void Booster(int? kind, System.Action<List<BoosterCard>, string> done)
    {
        if (Local)
        {
            var me = Profile.Me;
            if (me.Stardust < Progression.BoosterPrice) { done(null, $"A booster costs ✦{Progression.BoosterPrice} stardust."); return; }
            me.Stardust -= Progression.BoosterPrice;
            var rng = new System.Random();
            var cards = Progression.OpenBooster(kind, me.Collection, () => rng.NextDouble());
            foreach (var c in cards)
            {
                if (c.Flux != null) me.Flux += c.Flux.Value;
                else me.Collection[c.Id] = Profile.Owned(c.Id) + 1;
            }
            Profile.Save();
            done(cards, null);
            return;
        }
        var payload = new JObject();
        if (kind == null) payload["kind"] = "general";
        else payload["kind"] = kind.Value;
        Call("booster", payload, r =>
        {
            if (!r.Ok) { done(null, r.Error); return; }
            List<BoosterCard> cards = null;
            try { cards = Json.Read<List<BoosterCard>>(r.Data["cards"]?.ToString() ?? "[]"); }
            catch { }
            done(cards ?? new List<BoosterCard>(), null);
        });
    }

    /// <summary>Craft a copy of a card with flux. Why not, or null once done.</summary>
    public static void Craft(string id, System.Action<string> done)
    {
        if (Local)
        {
            var me = Profile.Me;
            var def = Cards.Def(id);
            int cost = Progression.CraftCost(id);
            if (Profile.Owned(id) >= Campaign.CopyLimit(id)) { done($"You already have as many {def.Name} as a deck can hold."); return; }
            if (me.Flux < cost) { done($"Crafting {def.Name} takes ⟁{cost} flux."); return; }
            me.Flux -= cost;
            me.Collection[id] = Profile.Owned(id) + 1;
            Profile.Save();
            done(null);
            return;
        }
        Call("craft", new JObject { ["id"] = id }, r => done(r.Error));
    }

    /// <summary>Break a copy of a card down for flux (starter cards can't be). Why not, or null once done.</summary>
    public static void BreakDown(string id, System.Action<string> done)
    {
        if (Local)
        {
            var me = Profile.Me;
            if (Progression.Breakable(me.Collection, id) <= 0) { done($"{Cards.Def(id).Name} is one of your starter cards: it can't be broken down."); return; }
            me.Collection[id] = Profile.Owned(id) - 1;
            me.Flux += Progression.BreakdownValue(id);
            Profile.Save();
            done(null);
            return;
        }
        Call("breakdown", new JObject { ["id"] = id }, r => done(r.Error));
    }
}
