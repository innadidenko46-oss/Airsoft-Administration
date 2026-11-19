import { AttachmentImage } from '../types/airsoft';

export async function compressImageFileToAttachment(
  file: File | Blob,
  defaultCaption = 'Zdjęcie z diagnostyki / serwisu ASG'
): Promise<AttachmentImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Nie udało się odczytać obrazu.'));
      }
    };
    reader.onerror = () => reject(new Error('Błąd odczytu pliku graficznego.'));
    reader.readAsDataURL(file);
  });

  const compressedUrl = await new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxWidth = 1200;
      const maxHeight = 900;
      let { width, height } = img;

      if (width > maxWidth || height > maxHeight) {
        const scale = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      try {
        let out = canvas.toDataURL('image/jpeg', 0.78);
        if (out.length > 180000) {
          out = canvas.toDataURL('image/jpeg', 0.62);
        }
        resolve(out.length < dataUrl.length ? out : dataUrl);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

  return {
    id: `cad-img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    dataUrl: compressedUrl,
    caption: defaultCaption,
  };
}

export function extractClipboardImages(
  clipboardData: DataTransfer | null
): File[] {
  if (!clipboardData) return [];
  const files: File[] = [];
  for (let i = 0; i < clipboardData.items.length; i++) {
    const item = clipboardData.items[i];
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (files.length === 0 && clipboardData.files.length > 0) {
    for (let i = 0; i < clipboardData.files.length; i++) {
      const f = clipboardData.files[i];
      if (f.type.startsWith('image/')) {
        files.push(f);
      }
    }
  }
  return files;
}

export interface PreparedAiImage {
  id: string;
  fileName: string;
  mimeType: string;
  dataBase64: string;
  previewUrl: string;
}

export async function prepareImageForAiImport(
  file: File | Blob,
  fileName = 'zrzut.png'
): Promise<PreparedAiImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Nie udało się odczytać zrzutu ekranu.'));
      }
    };
    reader.onerror = () => reject(new Error('Błąd odczytu obrazu.'));
    reader.readAsDataURL(file);
  });

  const resizedDataUrl = await new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1600;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      try {
        const jpeg = canvas.toDataURL('image/jpeg', 0.86);
        resolve(jpeg);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

  const match = resizedDataUrl.match(/^data:([^;]+);base64,(.+)$/);
  const mimeType = match ? match[1] : 'image/jpeg';
  const dataBase64 = match ? match[2] : resizedDataUrl;

  return {
    id: `imp-img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName,
    mimeType,
    dataBase64,
    previewUrl: resizedDataUrl,
  };
}

