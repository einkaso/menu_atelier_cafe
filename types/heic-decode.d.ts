declare module "heic-decode" {
  type DecodedHeicImage = {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  };

  export default function decodeHeic(input: { buffer: Buffer | Uint8Array | ArrayBuffer }): Promise<DecodedHeicImage>;
}
