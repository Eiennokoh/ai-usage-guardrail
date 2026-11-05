# 生成AI利用ルール（サンプル）／ Generative AI Usage Rules (Sample)

> 架空の資産運用会社を想定した社内ルールの例です。実際の運用では、自社の規程・法令・契約に合わせて見直してください。
> *This is a sample policy for a fictional asset management firm. Adapt it to your own regulations, laws and contracts before use.*

| 項目 / Item | 内容 / Details |
|---|---|
| 管理部署 / Owner | IT部・コンプライアンス部 / IT & Compliance |
| 対象者 / Scope | 役職員・派遣社員・業務委託先 / All officers, employees, temporary staff and contractors |
| 改定 / Review | 年1回以上 / At least once a year |

---

## 1. 目的 / Purpose

生成AIを業務の効率化に積極的に活用しつつ、顧客情報や未公表情報が社外に流出することを防ぎます。

*To make active use of generative AI for productivity while preventing client data and non-public information from leaving the firm.*

## 2. 利用してよいAI / Approved AI services

- 会社が契約し、IT部が承認したサービスだけを利用します（入力データが学習に使われない契約であることを確認済みのもの）。
- 個人のアカウントや無料版のAIサービスに、業務の情報を入力してはいけません。

*Use only services contracted by the firm and approved by the IT department (confirmed not to use input data for training). Do not enter business information into personal accounts or free AI services.*

## 3. 入力してはいけない情報 / Information you must not enter

| 区分 / Category | 例 / Examples | 扱い / Handling |
|---|---|---|
| 口座番号・カード番号 / Account & card numbers | 口座番号、クレジットカード番号 | 入力禁止 / Prohibited |
| マイナンバー / Individual Number (My Number) | 12桁の個人番号 | 入力禁止 / Prohibited |
| 未公表情報・社外秘 / Non-public & confidential information | 未公表の決算、M&A、インサイダー情報 | 入力禁止 / Prohibited |
| 顧客名・ファンド名 / Client & fund names | 年金基金名、取扱ファンド名 | 仮名に置き換えれば可 / Allowed only when replaced with placeholders |
| 個人の連絡先 / Personal contact details | メールアドレス、電話番号 | 仮名に置き換えれば可 / Allowed only when replaced with placeholders |

迷ったときは入力せず、コンプライアンス部に相談してください。

*When in doubt, do not enter it — consult the Compliance department.*

## 4. 送信前のチェック / Pre-send check

- 社内のAI利用画面には、送信前に自動でチェックする仕組み（本プロジェクト）が組み込まれています。
- 自動チェックは補助にすぎません。すべての表記ゆれや文脈を判断できるわけではないため、送信する前に自分の目でも確認してください。

*AI tools provided by the firm include an automatic pre-send check (this project). The check is only a safeguard: it cannot catch every spelling variant or understand context, so always review your input yourself before sending.*

## 5. AIの回答の扱い / Handling AI output

- AIの回答には誤りが含まれることがあります。数値・法令・制度に関する内容は、必ず原典で確認してください。
- AIが作成した文書を顧客に提出する場合は、担当者が内容を確認し、上長の承認を得てください。
- AIの回答をそのまま投資判断の根拠にしてはいけません。

*AI output may contain errors; verify figures, laws and regulations against original sources. Documents created with AI must be reviewed by the person in charge and approved by a manager before being sent to clients. Do not use AI output as the sole basis for investment decisions.*

## 6. 記録と監査 / Logging and audit

- AIの利用状況（利用者・部署・日時・トークン数・推定費用・ブロックの有無）は自動で記録されます。入力した内容そのものは、チェック用の記録には残しません。
- IT部とコンプライアンス部は、記録を定期的に確認し、ブロックが多い部署には個別に説明の場を設けます。

*Usage (user, department, timestamp, token count, estimated cost and whether the request was blocked) is logged automatically. The text you entered is not stored in this log. IT and Compliance review the logs regularly and follow up with departments that show frequent blocks.*

## 7. 事故・違反時の報告 / Reporting incidents

入力してはいけない情報を誤って送信した場合は、すぐにコンプライアンス部へ報告してください。早く報告することで、影響を最小限に抑えられます。報告したこと自体を理由に不利益な扱いを受けることはありません。

*If you accidentally send prohibited information, report it to Compliance immediately. Early reporting minimizes the impact, and you will not be penalized for reporting.*
