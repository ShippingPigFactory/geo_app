import os
import json
import googlemaps
from dotenv import load_dotenv

def debug_addresses():
    load_dotenv()
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not api_key:
        print("API Key not found.")
        return

    gmaps = googlemaps.Client(key=api_key)
    
    addresses = [
        "1-1 Chiyoda, Chiyoda City, Tokyo 100-8111",
        "東京都港区芝公園4-2-8",
        "東京都新宿区西新宿2-8-1 東京都庁",
        "愛知県西加茂郡三好町三好丘1-1",
        "大阪府北区梅田3-1-1"
    ]

    for addr in addresses:
        print("\n" + "="*50)
        print(f"Address: {addr}")
        try:
            results = gmaps.geocode(addr, language='ja', region='jp')
            if results:
                result = results[0]
                print(f"Formatted: {result.get('formatted_address')}")
                print("\nComponents:")
                for component in result.get('address_components', []):
                    # 各コンポーネントの long_name と types を表示
                    print(f"- {component.get('long_name')} ({', '.join(component.get('types', []))})")
            else:
                print("No results found.")
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    debug_addresses()
