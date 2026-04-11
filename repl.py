import os
import json
from dotenv import load_dotenv
from normalizer import AddressNormalizer

def main():
    load_dotenv()
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")

    if not api_key:
        print("エラー: .env ファイルに GOOGLE_MAPS_API_KEY が設定されていません。")
        return

    normalizer = AddressNormalizer(api_key)

    print("="*50)
    print("住所正規化ツール 実験用コンソール (REPL)")
    print("終了するには 'exit' または 'quit' と入力、または Ctrl+C を押してください。")
    print("="*50)

    while True:
        try:
            address = input("\n調査したい住所を入力してください > ").strip()
            
            if not address:
                continue
            if address.lower() in ['exit', 'quit']:
                break

            print(f"--- 実行中: {address} ---")
            result = normalizer.normalize(address)
            
            # 結果をきれいに表示
            print(json.dumps(result, indent=4, ensure_ascii=False))

        except KeyboardInterrupt:
            print("\n終了します。")
            break
        except Exception as e:
            print(f"予期せぬエラーが発生しました: {e}")

if __name__ == "__main__":
    main()
