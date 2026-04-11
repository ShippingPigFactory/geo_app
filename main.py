import os
import argparse
import pandas as pd
from dotenv import load_dotenv
from tqdm import tqdm
from normalizer import AddressNormalizer

def main():
    # .env ファイルの読み込み
    load_dotenv()
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")

    if not api_key:
        print("エラー: .env ファイルに GOOGLE_MAPS_API_KEY が設定されていません。")
        return

    # 引数の解析
    parser = argparse.ArgumentParser(description="住所正規化ツール")
    parser.add_argument("--input", "-i", required=True, help="入力CSVファイルパス")
    parser.add_argument("--column", "-c", required=True, help="住所が含まれるカラム名")
    parser.add_argument("--output", "-o", default="output.csv", help="出力CSVファイルパス")
    args = parser.parse_args()

    # CSVの読み込み
    try:
        # 様々なエンコーディングに対応（日本語環境を考慮）
        try:
            df = pd.read_csv(args.input, encoding='utf-8')
        except UnicodeDecodeError:
            df = pd.read_csv(args.input, encoding='shift_jis')
    except Exception as e:
        print(f"エラー: CSVファイルの読み込みに失敗しました: {e}")
        return

    if args.column not in df.columns:
        print(f"エラー: カラム '{args.column}' が入力ファイルに存在しません。")
        print(f"利用可能なカラム: {', '.join(df.columns)}")
        return

    # 正規化の実行
    normalizer = AddressNormalizer(api_key)
    results = []

    print(f"処理を開始します: {len(df)} 件")
    
    for index, row in tqdm(df.iterrows(), total=len(df)):
        raw_address = str(row[args.column])
        normalized_data = normalizer.normalize(raw_address)
        results.append(normalized_data)

    # 結果をDataFrameに変換して結合
    results_df = pd.DataFrame(results)
    output_df = pd.concat([df, results_df], axis=1)

    # CSV出力 (Excel対応のため BOM付きUTF-8)
    try:
        output_df.to_csv(args.output, index=False, encoding='utf_8_sig')
        print(f"\n処理が完了しました。結果を {args.output} に保存しました。")
    except Exception as e:
        print(f"エラー: ファイルの保存に失敗しました: {e}")

if __name__ == "__main__":
    main()
