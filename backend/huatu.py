import numpy as np
import plotly.graph_objects as go

# ============================================================
# Normality-aware latent space / manifold illustration
# Author: for paper-style framework figure
# ============================================================

np.random.seed(7)

# -----------------------------
# 1. Define manifold function
# -----------------------------
def manifold_z(x, y):
    return (
        0.35 * np.sin(1.15 * x)
        + 0.22 * np.cos(1.35 * y)
        + 0.12 * np.sin(0.75 * x * y)
    )


# -----------------------------
# 2. Create surface mesh
# -----------------------------
x = np.linspace(-3.3, 3.3, 120)
y = np.linspace(-2.2, 2.2, 90)
X, Y = np.meshgrid(x, y)
Z = manifold_z(X, Y)

surface = go.Surface(
    x=X,
    y=Y,
    z=Z,
    colorscale=[
        [0.0, "rgba(236,247,241,0.35)"],
        [0.35, "rgba(203,229,214,0.35)"],
        [0.70, "rgba(166,211,185,0.35)"],
        [1.0, "rgba(126,188,151,0.35)"],
    ],
    opacity=0.42,
    showscale=False,
    contours={
        "x": {"show": True, "color": "rgba(160,170,165,0.45)", "width": 1},
        "y": {"show": True, "color": "rgba(160,170,165,0.45)", "width": 1},
        "z": {"show": False},
    },
    name="Normal manifold",
    hoverinfo="skip",
)


# -----------------------------
# 3. Irregular purple boundary
# -----------------------------
t = np.linspace(0, 2 * np.pi, 500)

# Irregular radius makes the boundary look natural
r = 1.0 + 0.13 * np.sin(3 * t + 0.4) + 0.08 * np.cos(5 * t - 0.6)

bx = 2.65 * r * np.cos(t)
by = 1.55 * r * np.sin(t)
bz = manifold_z(bx, by) + 0.07

boundary = go.Scatter3d(
    x=bx,
    y=by,
    z=bz,
    mode="lines",
    line=dict(
        color="rgb(112, 52, 190)",
        width=6,
        dash="dash",
    ),
    name=r"Reconstructible Region",
    hoverinfo="skip",
)


# -----------------------------
# 4. Normal points inside boundary
# -----------------------------
n_normal = 48
theta_n = np.random.rand(n_normal) * 2 * np.pi
radius_n = np.sqrt(np.random.rand(n_normal)) * 0.83

px = 2.15 * radius_n * np.cos(theta_n)
py = 1.20 * radius_n * np.sin(theta_n)
pz = manifold_z(px, py) + 0.10 + 0.02 * np.random.randn(n_normal)

normal_points = go.Scatter3d(
    x=px,
    y=py,
    z=pz,
    mode="markers",
    marker=dict(
        size=5.5,
        color="rgb(95, 174, 62)",
        line=dict(color="rgb(40, 100, 35)", width=1.2),
        opacity=0.98,
    ),
    name="Normal<br>(Seen)",
)


# -----------------------------
# 5. Anomaly points outside / above manifold
# -----------------------------
n_anomaly = 12

# Place anomalies around boundary and slightly outside
theta_a = np.linspace(0.15, 2 * np.pi - 0.35, n_anomaly)
theta_a += np.random.uniform(-0.18, 0.18, n_anomaly)

radius_a = 1.02 + 0.22 * np.random.rand(n_anomaly)

ax_ = 2.70 * radius_a * np.cos(theta_a)
ay_ = 1.58 * radius_a * np.sin(theta_a)

az_surface = manifold_z(ax_, ay_) + 0.03
az_anomaly = az_surface + 0.38 + 0.18 * np.random.rand(n_anomaly)

anomaly_points = go.Scatter3d(
    x=ax_,
    y=ay_,
    z=az_anomaly,
    mode="markers",
    marker=dict(
        size=6.5,
        color="rgb(225, 32, 32)",
        line=dict(color="rgb(130, 0, 0)", width=1.2),
        opacity=1.0,
    ),
    name="Anomaly<br>(Unseen)",
)

# Vertical dashed lines from manifold to anomaly points
anomaly_lines = []
for xi, yi, z0, z1 in zip(ax_, ay_, az_surface, az_anomaly):
    anomaly_lines.append(
        go.Scatter3d(
            x=[xi, xi],
            y=[yi, yi],
            z=[z0, z1],
            mode="lines",
            line=dict(
                color="rgb(180, 40, 45)",
                width=3,
                dash="dash",
            ),
            showlegend=False,
            hoverinfo="skip",
        )
    )


# -----------------------------
# 6. Gap arrow and label
# -----------------------------
# Plotly 3D does not have native 3D arrowheads like matplotlib,
# so we draw a red double-arrow using lines + cones.
gap_y = -2.05
gap_z = manifold_z(0, gap_y) - 0.12

gap_line = go.Scatter3d(
    x=[-0.65, 0.45],
    y=[gap_y, gap_y],
    z=[gap_z, gap_z],
    mode="lines",
    line=dict(color="rgb(210, 35, 35)", width=6),
    showlegend=False,
    hoverinfo="skip",
)

# Left cone arrowhead
gap_cone_left = go.Cone(
    x=[-0.65],
    y=[gap_y],
    z=[gap_z],
    u=[-1],
    v=[0],
    w=[0],
    sizemode="absolute",
    sizeref=0.14,
    anchor="tip",
    colorscale=[[0, "rgb(210,35,35)"], [1, "rgb(210,35,35)"]],
    showscale=False,
    showlegend=False,
    hoverinfo="skip",
)

# Right cone arrowhead
gap_cone_right = go.Cone(
    x=[0.45],
    y=[gap_y],
    z=[gap_z],
    u=[1],
    v=[0],
    w=[0],
    sizemode="absolute",
    sizeref=0.14,
    anchor="tip",
    colorscale=[[0, "rgb(210,35,35)"], [1, "rgb(210,35,35)"]],
    showscale=False,
    showlegend=False,
    hoverinfo="skip",
)


# -----------------------------
# 7. Text labels in 3D space
# -----------------------------
labels = go.Scatter3d(
    x=[1.85, -0.08],
    y=[-1.55, gap_y - 0.05],
    z=[manifold_z(1.85, -1.55) + 0.40, gap_z - 0.08],
    mode="text",
    text=[
        "Reconstructible<br>Region R<sub>recon</sub>",
        "Gap",
    ],
    textfont=dict(
        family="Times New Roman",
        size=16,
        color=["rgb(55,55,55)", "rgb(180,35,35)"],
    ),
    showlegend=False,
    hoverinfo="skip",
)


# -----------------------------
# 8. Optional: add a faint projected base grid
# -----------------------------
# This gives a light scientific-illustration feel.
base_grid_lines = []
z_base = Z.min() - 0.18

for xi in np.linspace(-3.2, 3.2, 8):
    base_grid_lines.append(
        go.Scatter3d(
            x=[xi, xi],
            y=[-2.2, 2.2],
            z=[z_base, z_base],
            mode="lines",
            line=dict(color="rgba(180,180,180,0.25)", width=1),
            showlegend=False,
            hoverinfo="skip",
        )
    )

for yi in np.linspace(-2.2, 2.2, 7):
    base_grid_lines.append(
        go.Scatter3d(
            x=[-3.3, 3.3],
            y=[yi, yi],
            z=[z_base, z_base],
            mode="lines",
            line=dict(color="rgba(180,180,180,0.25)", width=1),
            showlegend=False,
            hoverinfo="skip",
        )
    )


# -----------------------------
# 9. Build figure
# -----------------------------
fig = go.Figure(
    data=[
        surface,
        boundary,
        normal_points,
        anomaly_points,
        *anomaly_lines,
        gap_line,
        gap_cone_left,
        gap_cone_right,
        labels,
        *base_grid_lines,
    ]
)

# -----------------------------
# 10. Layout / camera / style
# -----------------------------
fig.update_layout(
    width=900,
    height=620,
    margin=dict(l=0, r=0, t=20, b=0),
    paper_bgcolor="white",
    plot_bgcolor="white",
    showlegend=True,
    legend=dict(
        x=0.02,
        y=0.96,
        bgcolor="rgba(255,255,255,0)",
        borderwidth=0,
        font=dict(
            family="Times New Roman",
            size=15,
            color="black",
        ),
        itemsizing="constant",
    ),
    scene=dict(
        xaxis=dict(
            visible=False,
            showbackground=False,
            showgrid=False,
            zeroline=False,
        ),
        yaxis=dict(
            visible=False,
            showbackground=False,
            showgrid=False,
            zeroline=False,
        ),
        zaxis=dict(
            visible=False,
            showbackground=False,
            showgrid=False,
            zeroline=False,
        ),
        bgcolor="rgba(255,255,255,0)",
        aspectmode="manual",
        aspectratio=dict(x=2.7, y=1.65, z=0.75),
        camera=dict(
            eye=dict(x=1.35, y=-2.05, z=1.05),
            center=dict(x=0.02, y=0.02, z=-0.10),
            up=dict(x=0, y=0, z=1),
        ),
    ),
)

# -----------------------------
# 11. Show interactive figure
# -----------------------------
fig.show()

# -----------------------------
# 12. Export files
# -----------------------------
# Requires kaleido:
# pip install kaleido

fig.write_html("normality_aware_latent_space.html")
fig.write_image("normality_aware_latent_space.svg")
fig.write_image("normality_aware_latent_space.pdf")
fig.write_image("normality_aware_latent_space.png", scale=4)

print("Saved:")
print("normality_aware_latent_space.html")
print("normality_aware_latent_space.svg")
print("normality_aware_latent_space.pdf")
print("normality_aware_latent_space.png")