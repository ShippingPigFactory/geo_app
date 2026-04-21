import { Client, AddressComponent, AddressType } from "@googlemaps/google-maps-services-js";

export interface NormalizedAddress {
  normalized_address: string;
  postal_code: string;
  prefecture: string;
  city: string;
  town: string;
  address_line: string;
  building: string;
  latitude: number | null;
  longitude: number | null;
  error: string | null;
}

export class AddressNormalizer {
  private client: Client;
  private apiKey: string;

  constructor(apiKey: string) {
    this.client = new Client({});
    this.apiKey = apiKey;
  }

  async normalize(address: string): Promise<NormalizedAddress> {
    try {
      const response = await this.client.geocode({
        params: {
          address,
          key: this.apiKey,
          language: "ja",
          region: "jp",
        },
      });

      if (response.data.results.length === 0) {
        return this.emptyResult(address, "住所を特定できませんでした");
      }

      const result = response.data.results[0];
      const components = result.address_components;
      const geometry = result.geometry.location;

      const parsed = this.parseComponents(components);

      // 整形済み住所の取得とクリーンアップ
      let fullAddress = result.formatted_address || "";
      fullAddress = fullAddress
        .replace("日本、", "")
        .replace("日本 ", "")
        .replace("〒", "")
        .trim();

      // ビジネスルールの適用 (大字・字の削除、北海道の漢数字)
      const prefecture = parsed.prefecture || "";
      parsed.town = this.applyBusinessRules(parsed.town || "", prefecture);
      parsed.normalized_address = this.applyBusinessRules(fullAddress, prefecture);

      parsed.latitude = geometry.lat;
      parsed.longitude = geometry.lng;
      parsed.error = null;

      return parsed as NormalizedAddress;
    } catch (e: any) {
      return this.emptyResult(address, `APIエラー: ${e.message || String(e)}`);
    }
  }

  private applyBusinessRules(text: string, prefecture: string): string {
    if (!text) return text;

    // 1. 字・大字の削除
    let result = text.replace(/(大字|字)/g, "");

    // 2. 北海道の「n条」を漢数字に変換
    if (prefecture === "北海道") {
      result = this.hokkaidoKanjiNormalize(result);
    }

    return result;
  }

  private hokkaidoKanjiNormalize(text: string): string {
    return text.replace(/(\d+)条/g, (match, p1) => {
      const num = parseInt(p1, 10);
      return this.toKanji(num) + "条";
    });
  }

  private toKanji(n: number): string {
    const kanjiNums = "一二三四五六七八九";
    if (n < 1) return String(n);
    if (n < 10) return kanjiNums[n - 1];
    if (n === 10) return "十";
    if (n < 20) return "十" + kanjiNums[n - 10 - 1];
    if (n < 100) {
      const tens = Math.floor(n / 10);
      const ones = n % 10;
      let result = (tens === 1 ? "" : kanjiNums[tens - 1]) + "十";
      if (ones > 0) result += kanjiNums[ones - 1];
      return result;
    }
    return String(n);
  }

  private toHalfWidth(text: string): string {
    return text.normalize("NFKC");
  }

  private extractNumber(text: string): string {
    const normalized = this.toHalfWidth(text);
    const match = normalized.match(/(\d+)/);
    return match ? match[1] : "";
  }

  private hasDigit(text: string): boolean {
    return /\d/.test(this.toHalfWidth(text));
  }

  private parseComponents(components: AddressComponent[]): Partial<NormalizedAddress> {
    const raw: any = {
      postal_code: "",
      prefecture: "",
      locality: "",
      ward: "",
      sub_1: "",
      sub_2: "",
      sub_3: "",
      sub_4: "",
      premise: "",
      subpremise: "",
    };

    components.forEach((c) => {
      const types = c.types;
      const name = c.long_name;
      if (types.includes("postal_code" as AddressType)) raw.postal_code = name;
      if (types.includes("administrative_area_level_1" as AddressType)) raw.prefecture = name;
      if (types.includes("locality" as AddressType)) raw.locality = name;
      if (types.includes("ward" as AddressType)) raw.ward = name;
      if (types.includes("sublocality_level_1" as AddressType)) raw.sub_1 = name;
      if (types.includes("sublocality_level_2" as AddressType)) raw.sub_2 = name;
      if (types.includes("sublocality_level_3" as AddressType)) raw.sub_3 = name;
      if (types.includes("sublocality_level_4" as AddressType)) raw.sub_4 = name;
      if (types.includes("premise" as AddressType)) raw.premise = this.toHalfWidth(name);
      if (types.includes("subpremise" as AddressType)) raw.subpremise = this.toHalfWidth(name);
    });

    const data: Partial<NormalizedAddress> = {
      postal_code: raw.postal_code,
      prefecture: raw.prefecture,
      city: "",
      town: "",
      address_line: "",
      building: "",
    };

    // 市区町村 (city)
    const cityParts: string[] = [];
    if (raw.locality) cityParts.push(raw.locality);
    if (raw.ward && !cityParts.join("").includes(raw.ward)) {
      cityParts.push(raw.ward);
    }

    let sub1IsWard = false;
    if (raw.sub_1.endsWith("区") && !cityParts.join("").includes(raw.sub_1)) {
      cityParts.push(raw.sub_1);
      sub1IsWard = true;
    }
    data.city = cityParts.join("");

    // 町域 (town)
    let townCandidate = "";
    let remains: string[] = [];
    if (sub1IsWard) {
      townCandidate = raw.sub_2;
      remains = [raw.sub_3, raw.sub_4];
    } else {
      townCandidate = raw.sub_1;
      remains = [raw.sub_2, raw.sub_3, raw.sub_4];
    }

    if (townCandidate && !this.hasDigit(townCandidate)) {
      data.town = townCandidate;
    } else {
      remains.unshift(townCandidate);
      data.town = "";
    }

    // 番地 (address_line)
    const addrParts: string[] = [];
    remains.forEach((r) => {
      const num = this.extractNumber(r);
      if (num) addrParts.push(num);
    });
    data.address_line = addrParts.join("-");

    // 建物名 (building)
    const bParts: string[] = [];
    if (raw.premise) {
      if (!(this.isDigit(raw.premise) && data.address_line?.endsWith(raw.premise))) {
        bParts.push(raw.premise);
      }
    }
    if (raw.subpremise) bParts.push(raw.subpremise);
    data.building = bParts.join(" ");

    return data;
  }

  private isDigit(text: string): boolean {
    return /^\d+$/.test(text);
  }

  private emptyResult(rawAddress: string, errorMsg: string): NormalizedAddress {
    return {
      normalized_address: "",
      postal_code: "",
      prefecture: "",
      city: "",
      town: "",
      address_line: "",
      building: "",
      latitude: null,
      longitude: null,
      error: errorMsg,
    };
  }
}
