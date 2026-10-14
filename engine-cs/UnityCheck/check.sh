#!/bin/sh
# A quick compile check of the Unity client's scripts (unity/Assets/Scripts) without Unity: against the real engine
# modules (NuGet UnityEngine.Modules, a 2021 build), with UI and TextMeshPro stood in for by Shim.cs. It catches most
# compile errors in seconds; CI's Unity build is still the real check (Unity 6's own API, shaders, assemblies).
cd "$(dirname "$0")" && dotnet build -nologo -v q 2>&1 | grep -E " error |Build succeeded" | sort -u
