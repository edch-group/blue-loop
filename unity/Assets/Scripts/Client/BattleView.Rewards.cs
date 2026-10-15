using System.Linq;
using BlueLoop.Engine;
using UnityEngine;

/// <summary>
/// A game against the AI pays out (app.ts begin, holdResult, rewardLine; account.ts startAiGame, finishAiGame): the
/// server notes a new one as it begins (its id kept beside the save, so a continued game can still claim it), and pays
/// what it earned as it ends, said under the result ("no reward for this game" when it pays nothing). Not a campaign
/// battle (the campaign pays its own way), a lesson or a challenge, nor an online game (the room pays that).
/// </summary>
public partial class BattleView
{
    const string AiGameKey = "blue-loop:ai-game";
    /// <summary>Which server game this is against the AI (null: none, or not yet heard).</summary>
    string aiGameId;
    int gamesBegun;
    /// <summary>What the game earned you, for under its result (app.ts resultExtra).</summary>
    string resultExtra = "";

    void BeginAiGame()
    {
        gamesBegun++;
        resultExtra = "";
        int humans = state.Players.Count(p => !p.IsAI);
        if (humans != 1 || state.WinnerId != null || campaignOf != null || puzzleKind != null || online || !Application.isPlaying)
        {
            aiGameId = null;
            return;
        }
        if (state.TurnNumber > 1)
        {
            aiGameId = Store.Get(AiGameKey);
            return;
        }
        aiGameId = null;
        Store.Remove(AiGameKey);
        int begun = gamesBegun;
        EconomyCalls.StartAiGame(id =>
        {
            if (this == null || begun != gamesBegun) return;
            aiGameId = id;
            if (id != null) Store.Set(AiGameKey, id);
            else Store.Remove(AiGameKey);
        });
    }

    /// <summary>The game just ended: against the AI, the server pays the reward for the game it saw start.</summary>
    void PayAiGame(GameState next)
    {
        resultExtra = "";
        var viewer = next.Players.FirstOrDefault(p => p.Id == you);
        int humans = next.Players.Count(p => !p.IsAI);
        var gameId = aiGameId;
        if (viewer == null || online || humans != 1 || gameId == null || campaignOf != null) return;
        aiGameId = null;
        Store.Remove(AiGameKey);
        bool won = next.WinnerId == viewer.Id;
        EconomyCalls.FinishAiGame(gameId, won, next.ConcededBy == viewer.Id, p =>
        {
            if (this == null) return;
            resultExtra = p != null ? Account.RewardLine(p) : "no reward for this game";
            // (Already showing: drawn again with it, where it stands.)
            bool shown = resultCard != null;
            ClearResult();
            if (state == null) return;
            Refresh();
            if (shown && resultCard != null)
            {
                var rise = resultCard.GetComponent<ResultIn>();
                if (rise != null) Destroy(rise);
                resultCard.localScale = Vector3.one * 0.75f;
            }
        });
    }
}
