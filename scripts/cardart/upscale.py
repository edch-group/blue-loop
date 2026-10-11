#!/usr/bin/env python3
"""Sharpen card pictures cut small from a contact sheet: Real-ESRGAN (x4plus) run here on the CPU, no service needed.

    python3 scripts/cardart/upscale.py WEIGHTS.pth tide_regent kelp_wall ...

WEIGHTS.pth is RealESRGAN_x4plus.pth (github.com/xinntao/Real-ESRGAN releases; not kept in the repo). Each card's full
picture, generated/<id>.png, is enlarged 4x in place and cut again into the card's 640x400 picture (the middle of a
wide one, the upper part of a tall one). A picture already 600px wide or more is left alone. Needs torch and Pillow."""
import os, sys
import numpy as np
import torch
from torch import nn
from torch.nn import functional as F
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CARDS = os.path.join(HERE, '..', '..', 'src', 'assets', 'cards')
KEEP = os.path.join(HERE, 'generated')


class RDB(nn.Module):
    def __init__(self, nf=64, gc=32):
        super().__init__()
        self.conv1 = nn.Conv2d(nf, gc, 3, 1, 1)
        self.conv2 = nn.Conv2d(nf + gc, gc, 3, 1, 1)
        self.conv3 = nn.Conv2d(nf + 2 * gc, gc, 3, 1, 1)
        self.conv4 = nn.Conv2d(nf + 3 * gc, gc, 3, 1, 1)
        self.conv5 = nn.Conv2d(nf + 4 * gc, nf, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, True)

    def forward(self, x):
        x1 = self.lrelu(self.conv1(x))
        x2 = self.lrelu(self.conv2(torch.cat((x, x1), 1)))
        x3 = self.lrelu(self.conv3(torch.cat((x, x1, x2), 1)))
        x4 = self.lrelu(self.conv4(torch.cat((x, x1, x2, x3), 1)))
        return self.conv5(torch.cat((x, x1, x2, x3, x4), 1)) * 0.2 + x


class RRDB(nn.Module):
    def __init__(self, nf=64):
        super().__init__()
        self.rdb1, self.rdb2, self.rdb3 = RDB(nf), RDB(nf), RDB(nf)

    def forward(self, x):
        return self.rdb3(self.rdb2(self.rdb1(x))) * 0.2 + x


class RRDBNet(nn.Module):
    """The ESRGAN generator, laid out as Real-ESRGAN's weights expect."""
    def __init__(self, nf=64, nb=23):
        super().__init__()
        self.conv_first = nn.Conv2d(3, nf, 3, 1, 1)
        self.body = nn.Sequential(*[RRDB(nf) for _ in range(nb)])
        self.conv_body = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up1 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_up2 = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_hr = nn.Conv2d(nf, nf, 3, 1, 1)
        self.conv_last = nn.Conv2d(nf, 3, 3, 1, 1)
        self.lrelu = nn.LeakyReLU(0.2, True)

    def forward(self, x):
        feat = self.conv_first(x)
        feat = feat + self.conv_body(self.body(feat))
        feat = self.lrelu(self.conv_up1(F.interpolate(feat, scale_factor=2, mode='nearest')))
        feat = self.lrelu(self.conv_up2(F.interpolate(feat, scale_factor=2, mode='nearest')))
        return self.conv_last(self.lrelu(self.conv_hr(feat)))


def card_picture(img):
    w, h = img.size
    if w / h < 1.6:
        ch = int(w / 1.6); y = int((h - ch) * 0.4); img = img.crop((0, y, w, y + ch))
    else:
        cw = int(h * 1.6); x = (w - cw) // 2; img = img.crop((x, 0, x + cw, h))
    return img.resize((640, 400), Image.LANCZOS)


def main():
    weights, ids = sys.argv[1], sys.argv[2:]
    net = RRDBNet()
    state = torch.load(weights, map_location='cpu')
    net.load_state_dict(state.get('params_ema', state.get('params', state)))
    net.eval()
    torch.set_num_threads(os.cpu_count() or 4)
    for cid in ids:
        path = os.path.join(KEEP, f'{cid}.png')
        img = Image.open(path).convert('RGB')
        if img.width >= 600:
            print(f'{cid}: already {img.width}x{img.height}, left alone'); continue
        x = torch.from_numpy(np.asarray(img, dtype=np.float32) / 255).permute(2, 0, 1)[None]
        with torch.no_grad():
            y = net(x).clamp(0, 1)[0].permute(1, 2, 0).numpy()
        big = Image.fromarray((y * 255 + 0.5).astype(np.uint8))
        big.save(path)
        card_picture(big).save(os.path.join(CARDS, f'{cid}.webp'), quality=88)
        print(f'{cid}: {img.width}x{img.height} -> {big.width}x{big.height}', flush=True)


if __name__ == '__main__':
    main()
