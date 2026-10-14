using System.Collections.Generic;
using System.Linq;
using BlueLoop.Engine;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// A run's opening (campaign.ts beginRun, launch; nebula3d.ts ride, reveal): the camera alongside the flagship, close
/// up, as it cruises in and its hero speaks, the map's marks and panels hidden; then pulled back, turning as it goes,
/// to hold a moment on the whole strip, and settling slowly on the flagship as the panels come back. Set out from the
/// campaign menu, one shot all the way: the menu's options fly away, the menu's ship surges off over its land, and the
/// camera eases out and round from the menu's view to the ride beside the flagship, where the run takes over.
/// </summary>
public partial class CampaignView
{
    /// <summary>The opening shot: the longest the camera rides alongside the flagship, how long it takes to pull back, how long it holds on the whole strip.</summary>
    const float CineRideMax = 10, CineReveal = 4.2f, CineHold = 1.6f;
    /// <summary>Set out from the menu: how long the camera takes to pan from the menu's land to the ride.</summary>
    const float LaunchPan = 3.4f;

    /// <summary>Where the camera is, in the web's terms: what it looks at (web x, y, z), from which way, how far off.</summary>
    struct Pose { public float X, Y, Z, Yaw, Pitch, Dist; }

    /// <summary>The opening shot: "ride" (alongside the flagship), "reveal" (pulling back), "done" (just over: the panels come in).</summary>
    string cine;
    float rideEnds, revealT0, cineDone = -100;
    Pose revealFrom;
    /// <summary>The opening shot keeps to the side of the ship nearest this yaw (null: the side away from the camera's rest).</summary>
    float? rideNear;
    float yawNow = CamYaw, pitchNow = CamPitch, glideRate = 4;

    bool Cining => cine == "ride" || cine == "reveal";
    string FlagshipId => Campaign.Flagship(state, state.PlayerId)?.Id;

    static float Wrap(float a) => Mathf.Atan2(Mathf.Sin(a), Mathf.Cos(a));

    /// <summary>How far off the camera rests over the whole strip (the web's homeDist), in its units.</summary>
    float Whole => Mathf.Max(2.4f, (StripWidth / 2 + 0.3f) / (Mathf.Tan(18 * Mathf.Deg2Rad) * Mathf.Min(1, Mathf.Max(0.1f, Cam.aspect))) * 0.6f);

    /// <summary>The whole strip at once, from the near end to the wormhole and the Stellari past it: where the pull back ends.</summary>
    Pose Overview() => new Pose { X = 0.25f, Y = 0, Z = 0, Yaw = -0.95f + spin, Pitch = 0.66f, Dist = Whole * 1.05f };

    /// <summary>The camera put at a pose (the web's eye: off from what it looks at by yaw and pitch, z flipped here).</summary>
    void Aim(Pose p)
    {
        float cp = Mathf.Cos(p.Pitch);
        var back = new Vector3(Mathf.Sin(p.Yaw) * cp, Mathf.Sin(p.Pitch), -Mathf.Cos(p.Yaw) * cp);
        var target = world.TransformPoint(U(p.X, p.Y, p.Z));
        Cam.transform.position = target + back * p.Dist * G;
        Cam.transform.rotation = Quaternion.LookRotation(-back, Vector3.up);
    }

    /// <summary>
    /// The opening shot's camera beside a ship here (web x, y, z, facing `heading`): off its side and a little ahead, the
    /// side away from where the camera will come to rest (so the turn out to the map is a wide one; or, set out from the
    /// menu, the side its camera was already on, so the pan onto it never swings round), drifting slowly round, looking
    /// a little to the ship's left so it sits right of centre, clear of the hero's words.
    /// </summary>
    Pose RideAt(Vector3 sh, float heading, float time)
    {
        float fx = Mathf.Cos(heading), fz = Mathf.Sin(heading);
        float Side(float k) => Mathf.Atan2(-fz * k + fx * 0.7f, fx * k + fz * 0.7f);
        float By(float y) => rideNear == null ? -Mathf.Abs(Wrap(y - CamYaw)) : Mathf.Abs(Wrap(y - rideNear.Value));
        float yaw = (By(Side(1)) < By(Side(-1)) ? Side(1) : Side(-1)) + 0.12f * Mathf.Sin(time * 0.25f);
        const float off = 0.13f;
        return new Pose { X = sh.x - Mathf.Cos(yaw) * off, Y = sh.y, Z = sh.z + Mathf.Sin(yaw) * off, Yaw = yaw, Pitch = 0.2f + 0.04f * Mathf.Sin(time * 0.18f), Dist = 0.5f };
    }

    bool RidePose(out Pose p)
    {
        p = default;
        if (!ShipPose(FlagshipId, out var at, out var heading)) return false;
        p = RideAt(at, heading, Clock);
        return true;
    }

    /// <summary>The camera through the opening shot this frame (false: none playing).</summary>
    bool CinePose(out Pose p)
    {
        p = default;
        if (!Cining || launching) return false;
        bool rode = RidePose(out var ride);
        if (cine == "ride")
        {
            p = ride;
            return rode;
        }
        float t = Clock - revealT0;
        float k = Mathf.Min(1, t / CineReveal);
        if (k >= 1)
        {
            // (Held a moment on the whole strip, then it is over: the camera settles on the flagship.)
            if (t < CineReveal + CineHold)
            {
                p = Overview();
                return true;
            }
            FinishCine();
            return false;
        }
        // (Eased in and out; the pull back leads the turn a little, so the map opens out as it comes round; the distance
        // eased in its logarithm, out from close up at an even pace to the eye.)
        float e = k * k * k * (k * (6 * k - 15) + 10);
        float o = 1 - Mathf.Pow(1 - k, 2.2f);
        var a = rode ? ride : revealFrom;
        var b = Overview();
        float dy = Wrap(b.Yaw - a.Yaw);
        p = new Pose
        {
            X = a.X + (b.X - a.X) * e,
            Y = a.Y + (b.Y - a.Y) * e,
            Z = a.Z + (b.Z - a.Z) * e,
            Yaw = a.Yaw + dy * e,
            Pitch = a.Pitch + (b.Pitch - a.Pitch) * e,
            Dist = a.Dist * Mathf.Pow(b.Dist / a.Dist, o),
        };
        return true;
    }

    /// <summary>The hero has had their say: the ship is let go to fly in, and the camera pulls back and turns to show the map.</summary>
    void EndRide()
    {
        if (cine != "ride") return;
        RidePose(out revealFrom);
        cine = "reveal";
        revealT0 = Clock;
        Release(FlagshipId, CineReveal * 0.8f);
        Sound.Play("whoosh");
    }

    /// <summary>The opening shot over: the camera settles, slowly, from the whole strip onto the flagship; the panels come back and the run is announced.</summary>
    void FinishCine()
    {
        var b = Overview();
        focus = U(b.X, b.Y, b.Z);
        distance = b.Dist * G;
        yawNow = b.Yaw;
        pitchNow = b.Pitch;
        var f = Campaign.Flagship(state, state.PlayerId);
        if (f != null) focusGoal = Home(f.NodeId);
        distanceGoal = RestDist;
        glideRate = 1.6f;
        cine = "done";
        cineDone = Clock;
        Refresh();
        Toast("galaxy 1 · reach the wormhole");
    }

    // ---- The panels through the opening shot ----

    static readonly string[] Panels = { "You", "Purse", "Settings" };

    /// <summary>Through the opening shot only the hero's words show; when it is over, the rest fades in.</summary>
    void CineHud()
    {
        foreach (Transform c in top)
        {
            if (!Panels.Contains(c.name)) continue;
            c.gameObject.SetActive(!Cining && !launching);
            if (cine == "done" && c.GetComponent<CanvasGroup>() == null) c.gameObject.AddComponent<CanvasGroup>().alpha = 0;
        }
        HudFade(Clock);
    }

    void HudFade(float now)
    {
        if (cine != "done" || top == null) return;
        float a = Mathf.Clamp01((now - cineDone) / 1f);
        foreach (Transform c in top)
        {
            var g = c.GetComponent<CanvasGroup>();
            if (g != null && Panels.Contains(c.name)) g.alpha = a;
        }
    }

    // ---- Set out from the menu ----

    bool launching;
    Pose launchPose;

    bool LaunchPose(out Pose p)
    {
        p = launchPose;
        return launching;
    }

    /// <summary>
    /// Set out from the campaign menu (campaign.ts launch) [direction: no fade between the two screens; the ship moving
    /// forwards, away from the crumbling terrain, the camera panning out and right to the campaign's starting angle, one
    /// continuous shot]: each option flies up and away toward the side of the screen nearest it, the rest of the page
    /// fades, the menu's ship surges away ahead, the land's breaking holds, and the camera eases out and round from the
    /// menu's view to the ride beside the flagship (the first galaxy lies on the menu's own land, drawn here from the
    /// first frame). The menu's ship is seen as the run's camera sees its flagship, scaled to it, so at the end the two
    /// are one: there the menu is taken away (`done`) and the run's opening shot plays on.
    /// </summary>
    public void Launch(CampaignBackdrop scene, Canvas menuCanvas, Camera menuCam, System.Action done)
    {
        var cams = scene != null ? scene.Cameras : null;
        if (!Application.isPlaying || cams == null || cams.Length < 2 || cams[0] == null || scene.ShipCamera == null)
        {
            done?.Invoke();
            return;
        }
        StartCoroutine(Launching(scene, menuCanvas, menuCam, done));
    }

    System.Collections.IEnumerator Launching(CampaignBackdrop scene, Canvas menuCanvas, Camera menuCam, System.Action done)
    {
        var landCam = scene.Cameras[0];
        var shipCam = scene.ShipCamera;
        // Where the menu's land camera was (its scene is in the web's own units, z flipped): the pan sets out from there.
        var eye = Mirror(landCam.transform.position);
        var look = Mirror(landCam.transform.forward);
        const float dist0 = 3.4f;
        var start = new Pose
        {
            X = eye.x + look.x * dist0, Y = eye.y + look.y * dist0, Z = eye.z + look.z * dist0,
            Yaw = Mathf.Atan2(-look.x, -look.z), Pitch = Mathf.Asin(Mathf.Clamp(-look.y, -1, 1)), Dist = dist0,
        };
        // (How far its land had broken away: it stays gone on the first map.)
        var groundR = scene.transform.Find("Land/Ground")?.GetComponent<MeshRenderer>();
        menuGone = groundR != null ? groundR.sharedMaterial.GetFloat("_Gone") : start.X - 1.1f;
        // The flagship sets out from where the menu's ship is over the land, heading for its first system: it surges
        // forward as the camera pans, well clear of the breaking land by the time the pan is done, then cruises on.
        var me = Campaign.Flagship(state, state.PlayerId);
        var first = me != null ? state.Nodes.FirstOrDefault(x => x.Id == me.NodeId) : null;
        launchFrom = new Vector2(start.X, start.Z);
        launchSurge = first != null ? Vector2.Distance(Web(first.X, first.Y), launchFrom.Value) * 0.5f : 0;
        rideNear = start.Yaw;
        if (me != null && tracks.TryGetValue(me.Id, out var old))
        {
            if (old.T != null) KillAll(old.T.gameObject);
            tracks.Remove(me.Id);
        }
        arriving = true;
        launching = true;
        launchPose = start;
        Map();
        // (The menu's own ship stands in for the flagship until the two are one.)
        ShipTrack flag = null;
        if (me != null && tracks.TryGetValue(me.Id, out flag))
        {
            flag.Hidden = true;
            Show(flag, false);
        }
        Refresh();
        // The run's camera draws the land from here on, under the menu's ship and its page; the menu's land camera, and
        // its scene's own posing, stop.
        hud.enabled = false;
        Cam.depth = shipCam.depth - 1;
        landCam.enabled = false;
        scene.enabled = false;
        Aim(start);
        // (The menu's page on a layer of its own, its camera drawing nothing else: never the run's scene.)
        if (menuCanvas != null)
            foreach (var t in menuCanvas.GetComponentsInChildren<Transform>(true)) t.gameObject.layer = 5;
        if (menuCam != null) menuCam.cullingMask = 1 << 5;
        // Each option flies up and away toward the side of the screen nearest it, one after another, fading.
        var options = new List<(RectTransform r, Vector2 rest, Vector2 way, CanvasGroup g)>();
        CanvasGroup page = null;
        if (menuCanvas != null && menuCam != null)
        {
            page = menuCanvas.GetComponent<CanvasGroup>();
            if (page == null) page = menuCanvas.gameObject.AddComponent<CanvasGroup>();
            page.interactable = false;
            page.blocksRaycasts = false;
            float W = menuCam.pixelWidth, H = menuCam.pixelHeight, scale = Mathf.Max(0.01f, menuCanvas.scaleFactor);
            foreach (var b in menuCanvas.GetComponentsInChildren<Button>())
            {
                var r = (RectTransform)b.transform;
                var c = RectTransformUtility.WorldToScreenPoint(menuCam, r.position);
                var size = r.rect.size * scale;
                float x = c.x, fromTop = H - c.y;
                float left = x, right = W - x;
                float m = Mathf.Min(left, Mathf.Min(right, fromTop));
                var way = m == fromTop ? new Vector2((x - W / 2) * 0.3f, fromTop + size.y + 80)
                    : m == left ? new Vector2(-(x + size.x + 80), H * 0.18f)
                    : new Vector2(right + size.x + 80, H * 0.18f);
                var fade = b.GetComponent<CanvasGroup>();
                if (fade == null) fade = b.gameObject.AddComponent<CanvasGroup>();
                options.Add((r, r.anchoredPosition, way / scale, fade));
            }
        }
        Sound.Play("whoosh");
        // The menu's ship's camera, as it was: where the hand-over sets out from.
        var shipRoot = scene.transform.Find("Ship scene");
        var fromEye = shipCam.transform.position;
        var fromTarget = fromEye + shipCam.transform.forward * (shipRoot != null ? Vector3.Distance(fromEye, shipRoot.position) : 5);
        float fromFov = shipCam.fieldOfView, fromOff = -shipCam.projectionMatrix.m02 / 2;
        float t0 = Clock;
        Restart(FlagshipId);
        while (true)
        {
            float t = Clock - t0;
            for (int i = 0; i < options.Count; i++)
            {
                var (r, rest, way, g) = options[i];
                if (r == null) continue;
                float u = Mathf.Clamp01((t - i * 0.06f) / 0.7f);
                // (Slow away, then quick: cubic-bezier(0.5, 0, 0.85, 0.4), near enough.)
                r.anchoredPosition = rest + way * Mathf.Pow(u, 2.4f);
                g.alpha = 1 - Mathf.Clamp01((t - i * 0.06f - 0.1f) / 0.6f);
            }
            if (page != null) page.alpha = 1 - Mathf.Clamp01((t - 0.25f) / 0.6f);
            // The pan: from the menu's view to the ride beside the flagship, eased in and out.
            float k = Mathf.Clamp01(t / LaunchPan);
            float e = k * k * (3 - 2 * k);
            Pose to = RidePose(out var ride) ? ride : start;
            float dy = Wrap(to.Yaw - start.Yaw);
            launchPose = new Pose
            {
                X = start.X + (to.X - start.X) * e,
                Y = start.Y + (to.Y - start.Y) * e,
                Z = start.Z + (to.Z - start.Z) * e,
                Yaw = start.Yaw + dy * e,
                Pitch = start.Pitch + (to.Pitch - start.Pitch) * e,
                Dist = start.Dist + (to.Dist - start.Dist) * e,
            };
            Aim(launchPose);
            // The menu's ship, seen as this camera sees the flagship (the flagship 0.2 long, the menu's 4.2: its scene
            // scaled to it), eased to from where its own camera was: at the end, exactly so.
            if (shipRoot != null && ShipPose(FlagshipId, out var at, out var heading))
            {
                var F = new Vector3(Mathf.Cos(heading), 0, Mathf.Sin(heading));
                var R = new Vector3(-F.z, 0, F.x);
                Vector3 Into(Vector3 v) => new Vector3(Vector3.Dot(v, F), v.y, Vector3.Dot(v, R));
                float cp = Mathf.Cos(launchPose.Pitch);
                var back = new Vector3(Mathf.Sin(launchPose.Yaw) * cp, Mathf.Sin(launchPose.Pitch), Mathf.Cos(launchPose.Yaw) * cp);
                var camEye = new Vector3(launchPose.X, launchPose.Y, launchPose.Z) + back * launchPose.Dist;
                float s = 4.2f / ShipSize;
                var eyeM = Into(camEye - at) * s;
                var lookM = Into(-back);
                var L = shipRoot.localToWorldMatrix;
                var eye1 = L.MultiplyPoint3x4(eyeM);
                var target1 = L.MultiplyPoint3x4(eyeM + lookM * eyeM.magnitude);
                var eyeNow = Vector3.Lerp(fromEye, eye1, e);
                var targetNow = Vector3.Lerp(fromTarget, target1, e);
                shipCam.transform.position = eyeNow;
                if ((targetNow - eyeNow).sqrMagnitude > 1e-8f) shipCam.transform.rotation = Quaternion.LookRotation(targetNow - eyeNow, Vector3.up);
                shipCam.ResetProjectionMatrix();
                shipCam.fieldOfView = Mathf.Lerp(fromFov, Cam.fieldOfView, e);
                var proj = shipCam.projectionMatrix;
                proj.m02 = -fromOff * (1 - e) * 2;
                shipCam.projectionMatrix = proj;
            }
            if (k >= 1) break;
            yield return null;
        }
        // The run takes over, on this very frame: its flagship where the menu's ship was, the menu taken away.
        launching = false;
        launchFrom = null;
        Cam.depth = 0;
        hud.enabled = true;
        if (flag != null && flag.T != null)
        {
            flag.Hidden = false;
            Show(flag, true);
        }
        rideEnds = Clock + CineRideMax;
        done?.Invoke();
        Rings();
        Refresh();
    }
}
