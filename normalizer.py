import os
import googlemaps
import unicodedata
import re
from typing import Dict, Any

class AddressNormalizer:
    """
    Google Maps Geocoding APIを使用して、日本の住所を極めて正確に正規化するクラス。
    さらに「字・大字」の削除や北海道の漢数字表記などのビジネスルールを適用する。
    """

    def __init__(self, api_key: str):
        self.gmaps = googlemaps.Client(key=api_key)

    def normalize(self, address: str) -> Dict[str, Any]:
        """
        住所文字列を正規化し、構造化されたデータを返す。
        """
        try:
            geocode_result = self.gmaps.geocode(address, language='ja', region='jp')

            if not geocode_result:
                return self._empty_result(address, "住所を特定できませんでした")

            result = geocode_result[0]
            components = result.get('address_components', [])
            geometry = result.get('geometry', {}).get('location', {})

            parsed = self._parse_components(components)
            
            # 整形済み住所の取得とクリーンアップ
            full_address = result.get('formatted_address', '')
            full_address = full_address.replace('日本、', '').replace('日本 ', '').replace('〒', '').strip()
            
            # ビジネスルールの適用 (大字・字の削除、北海道の漢数字)
            prefecture = parsed['prefecture']
            parsed['town'] = self._apply_business_rules(parsed['town'], prefecture)
            parsed['normalized_address'] = self._apply_business_rules(full_address, prefecture)
            
            parsed['latitude'] = geometry.get('lat')
            parsed['longitude'] = geometry.get('lng')
            parsed['error'] = None

            return parsed

        except Exception as e:
            return self._empty_result(address, f"APIエラー: {str(e)}")

    def _apply_business_rules(self, text: str, prefecture: str) -> str:
        """
        「字・大字」の削除、および北海道の「n条」を漢数字に変換する。
        """
        if not text:
            return text
            
        # 1. 字・大字の削除
        text = re.sub(r'(大字|字)', '', text)
        
        # 2. 北海道の「n条」を漢数字に変換
        if prefecture == "北海道":
            text = self._hokkaido_kanji_normalize(text)
            
        return text

    def _hokkaido_kanji_normalize(self, text: str) -> str:
        """
        北海道の「n条」という表記を漢数字に変換する。
        """
        def replacer(match):
            num = int(match.group(1))
            return self._to_kanji(num) + "条"

        # 自然数+条 のパターンを探して置換
        return re.sub(r'(\d+)条', replacer, text)

    def _to_kanji(self, n: int) -> str:
        """
        数字(1-99)を漢数字に変換する。
        """
        kanji_nums = "一二三四五六七八九"
        if n < 1: return str(n)
        if n < 10:
            return kanji_nums[n-1]
        if n == 10:
            return "十"
        if n < 20:
            return "十" + kanji_nums[n-10-1]
        if n < 100:
            tens = n // 10
            ones = n % 10
            result = kanji_nums[tens-1] + "十"
            if ones > 0:
                result += kanji_nums[ones-1]
            return result
        return str(n)

    def _to_half_width(self, text: str) -> str:
        return unicodedata.normalize('NFKC', text)

    def _extract_number(self, text: str) -> str:
        text = self._to_half_width(text)
        match = re.search(r'(\d+)', text)
        return match.group(1) if match else ""

    def _has_digit(self, text: str) -> bool:
        return any(c.isdigit() for c in self._to_half_width(text))

    def _parse_components(self, components: list) -> Dict[str, Any]:
        """
        address_componentsを日本の住所体系（スライディング階層対応）にマッピングする。
        """
        raw = {
            'postal_code': '', 'prefecture': '', 'locality': '', 'ward': '',
            'sub_1': '', 'sub_2': '', 'sub_3': '', 'sub_4': '',
            'premise': '', 'subpremise': ''
        }

        for c in components:
            types = c.get('types', [])
            name = c.get('long_name', '')
            if 'postal_code' in types: raw['postal_code'] = name
            if 'administrative_area_level_1' in types: raw['prefecture'] = name
            if 'locality' in types: raw['locality'] = name
            if 'ward' in types: raw['ward'] = name
            if 'sublocality_level_1' in types: raw['sub_1'] = name
            if 'sublocality_level_2' in types: raw['sub_2'] = name
            if 'sublocality_level_3' in types: raw['sub_3'] = name
            if 'sublocality_level_4' in types: raw['sub_4'] = name
            if 'premise' in types: raw['premise'] = self._to_half_width(name)
            if 'subpremise' in types: raw['subpremise'] = self._to_half_width(name)

        data = {
            'postal_code': raw['postal_code'], 'prefecture': raw['prefecture'],
            'city': '', 'town': '', 'address_line': '', 'building': ''
        }

        # 市区町村 (city)
        city_parts = []
        if raw['locality']: city_parts.append(raw['locality'])
        if raw['ward'] and raw['ward'] not in "".join(city_parts):
            city_parts.append(raw['ward'])
        
        sub_1_is_ward = False
        if raw['sub_1'].endswith('区') and raw['sub_1'] not in "".join(city_parts):
            city_parts.append(raw['sub_1'])
            sub_1_is_ward = True
        
        data['city'] = "".join(city_parts)

        # 町域 (town)
        if sub_1_is_ward:
            town_candidate = raw['sub_2']
            remains = [raw['sub_3'], raw['sub_4']]
        else:
            town_candidate = raw['sub_1']
            remains = [raw['sub_2'], raw['sub_3'], raw['sub_4']]
        
        if town_candidate and not self._has_digit(town_candidate):
            data['town'] = town_candidate
        else:
            remains.insert(0, town_candidate)
            data['town'] = ""

        # 番地 (address_line)
        addr_parts = []
        for r in remains:
            num = self._extract_number(r)
            if num: addr_parts.append(num)
        data['address_line'] = "-".join(addr_parts)

        # 建物名 (building)
        b_parts = []
        if raw['premise']:
            if not (raw['premise'].isdigit() and data['address_line'].endswith(raw['premise'])):
                b_parts.append(raw['premise'])
        if raw['subpremise']: b_parts.append(raw['subpremise'])
        data['building'] = " ".join(b_parts)

        return data

    def _empty_result(self, raw_address: str, error_msg: str) -> Dict[str, Any]:
        return {
            'normalized_address': '', 'postal_code': '', 'prefecture': '',
            'city': '', 'town': '', 'address_line': '', 'building': '',
            'latitude': None, 'longitude': None, 'error': error_msg
        }
