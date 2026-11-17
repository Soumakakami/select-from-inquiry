# 公開

## 現状（2026-11-17）

- リポジトリ `Soumakakami/select-from-inquiry` は **公開（Public）**。
- **GitHub Pages で公開中**：https://soumakakami.github.io/select-from-inquiry/ （`main` ブランチの `/docs` から配信）
- 開発中の確認用に、Claude のアーティファクトとしても同じ版を置いている（非公開。リンク共有で人に遊んでもらうこともできる）。

## 公開方法の検討結果

| 方法 | 評価 |
|---|---|
| Claude アーティファクトのリンク共有 | いちばん手軽。知り合いに試してもらう用途向け。URL が claude.ai になり、独自ドメインやSNS用の設定はできない |
| **GitHub Pages** | **採用**。静的ファイルを置くだけ。帯域はソフト上限で月100GB。このゲームは初回の読み込みが1MB弱なので、個人公開なら十分 |
| Cloudflare Pages | アクセスが急増しそうなときの候補。静的ファイルへのリクエストは無制限、1ファイル25MiBまで |
| itch.io | ゲーム好きに見つけてもらいたいとき。「HTML Game」で `index.html` を含む ZIP をアップロード |

## GitHub Pages で公開する手順

無料プランの GitHub Pages は公開リポジトリでしか使えないので、公開するときは次の2つをまとめて行う。

1. GitHub のリポジトリ → **Settings → General → Danger Zone → Change visibility** で Public にする。
2. **Settings → Pages** で、Source を「Deploy from a branch」、Branch を `main`、フォルダを `/docs` にして保存。
3. 数分後に `https://soumakakami.github.io/select-from-inquiry/` で公開される。

`docs/.nojekyll` があるので、Jekyll の変換はかからない。

更新するときは `npm run build` → `docs/` を含めてコミット → push で反映される。

## 公開前に確認すること

- **答えがブラウザから見える**：採点がクライアント側なので、ソースを読めば正解が分かる。カジュアルに遊ぶ分には問題ない。ランキングを付ける場合は、判定とスコア保存をサーバー側に移す（例：Cloudflare Workers + D1、自前の Laravel など）。
- **`documents/cases.md` はネタバレ**：リポジトリを公開すると誰でも読める。気になるなら、公開前に別の場所へ移すか、ネタバレ注意をはっきり書く。
- **会社との線引き**：題材が本業そのものなので、実在の社内テーブル設計、ログの形式、実際の問い合わせは使わない。いまのデータとシナリオはすべて架空のもの。収益化する場合は副業規定も確認する。
- **SNS用の設定**：X などでシェアされたときの表示用に、`src/index.html` に OGP（`og:title`、`og:description`、`og:image`）を足すとよい。画像は `docs/` に置く。
- **ライセンス**：sql.js は MIT License。リポジトリ自体のライセンスはまだ決めていない。公開するなら LICENSE を置くかどうかを決める。
