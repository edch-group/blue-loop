using UnityEngine;

/// <summary>
/// Heat in flight (the web's projectile): a glowing mote from where it was loosed to the sun it strikes, on a low arc,
/// and on landing, the sun's flare.
/// </summary>
public class Shot : MonoBehaviour
{
    Vector3 from, to;
    float delay, age, flight = 0.42f;
    SunView target;
    bool hot;

    public static void Fire(Transform parent, Vector3 from, Vector3 to, SunView target, bool hot, float delay)
    {
        var go = new GameObject("Shot");
        go.transform.SetParent(parent, false);
        var s = go.AddComponent<Shot>();
        s.from = from;
        s.to = to;
        s.target = target;
        s.hot = hot;
        s.delay = delay;
        var core = Mats.Flat("Mote", go.transform, Mats.Make("Soft", hot ? new Color(1f, 0.62f, 0.25f, 0.95f) : new Color(0.45f, 0.7f, 1f, 0.95f)), 0.7f, 0.7f);
        core.sharedMaterial.SetFloat("_Aspect", 1);
        core.sharedMaterial.SetFloat("_Size", 0.1f);
        core.sharedMaterial.SetFloat("_Radius", 0.1f);
        core.sharedMaterial.SetFloat("_Soft", 0.12f);
        core.sharedMaterial.renderQueue = 3100;
        go.transform.position = from;
        go.SetActive(true);
        core.enabled = false;
    }

    void Update()
    {
        age += Time.deltaTime;
        float t = (age - delay) / flight;
        var r = GetComponentInChildren<MeshRenderer>(true);
        if (t < 0) return;
        r.enabled = true;
        if (t >= 1)
        {
            if (target != null) target.Pulse(hot);
            Mats.Kill(gameObject);
            return;
        }
        float e = t * t * (3 - 2 * t);
        transform.position = Vector3.Lerp(from, to, e) + Vector3.up * Mathf.Sin(Mathf.PI * t) * 1.2f;
        // (Facing the viewer, a flat glow.)
        var cam = Camera.main != null ? Camera.main : FindAnyObjectByType<Camera>();
        if (cam != null) transform.rotation = Quaternion.FromToRotation(Vector3.up, -cam.transform.forward);
    }
}
