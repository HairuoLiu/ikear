/**
 * M2 发布流程状态机 —— 把「草稿 + 引导式拍照」的状态流转收敛到一个 hook。
 *
 * 职责边界：
 * - 校验规则唯一真源是 src/lib/listingRules.ts（本文件只消费，不重定义阈值）。
 * - 状态写入唯一入口是 src/store/useStore.ts 的 draft actions（本文件只编排，不直接 set）。
 * - UI 只消费本文件暴露的 API，不需要自己拼 canPublish / photoProgress。
 *
 * 发布校验：硬底 2 张（HARD_PHOTO_MIN）满足即可发布，第 3 张只是软建议、不阻塞。
 * hook 内**不做**任何额外的发布校验，避免与 listingRules 出现第二套语义。
 */
import { useCallback, useEffect } from 'react';
import {
  HARD_PHOTO_MIN,
  MAX_PHOTOS,
  canAddPhoto,
  canPublish,
  photoProgress,
  type PhotoProgress,
} from '../lib/listingRules';
import { useStore, type DraftListing } from '../store/useStore';
import type { Listing } from '../data/types';

export interface UseCreateListing {
  /** 当前草稿；startDraft 在挂载时执行，首帧后即非空 */
  draft: DraftListing | null;
  /** 照片进度（n/2 硬底、n/3 建议），直接喂给引导式拍照 UI */
  progress: PhotoProgress;
  /** 还能不能再加照片 —— 用于置灰「添加照片」按钮 */
  canAdd: boolean;
  /** 能不能发布 —— 用于置灰「发布」按钮 */
  canSubmit: boolean;
  /** 上限 9 张，透出给 UI 显示文案 */
  maxPhotos: number;
  /** 硬底 2 张，透出给 UI 显示文案 */
  requiredPhotos: number;
  update: (patch: Partial<DraftListing>) => void;
  /** 添加一张照片；超过 MAX_PHOTOS 时拒绝并返回 false */
  addPhoto: (uri: string) => boolean;
  removePhoto: (i: number) => void;
  setCover: (i: number) => void;
  /** 发布成功返回新 Listing 并清空草稿；校验不过返回 null 且保留草稿 */
  publish: () => Listing | null;
}

export function useCreateListing(): UseCreateListing {
  const draft = useStore((s) => s.drafts);
  const startDraft = useStore((s) => s.startDraft);
  const updateDraft = useStore((s) => s.updateDraft);
  const addDraftPhoto = useStore((s) => s.addDraftPhoto);
  const removeDraftPhoto = useStore((s) => s.removeDraftPhoto);
  const setDraftCover = useStore((s) => s.setDraftCover);
  const clearDraft = useStore((s) => s.clearDraft);
  const publishDraft = useStore((s) => s.publishDraft);

  // 进入发布流程即开草稿；store 内部已做「有草稿则续编」，重复进出不会丢内容。
  useEffect(() => {
    startDraft();
  }, [startDraft]);

  const update = useCallback(
    (patch: Partial<DraftListing>) => {
      updateDraft(patch);
    },
    [updateDraft]
  );

  const addPhoto = useCallback(
    (uri: string) => {
      // 读实时 state 而非闭包快照：相册多选会在同一帧内连续调用，闭包值会漏判上限。
      const current = useStore.getState().drafts;
      if (!current || !canAddPhoto(current)) return false;
      addDraftPhoto(uri);
      return true;
    },
    [addDraftPhoto]
  );

  const removePhoto = useCallback(
    (i: number) => {
      // 删除后的封面下标修正由 store 负责（删封面→回退到第 0 张，删封面之前→下标 -1）。
      removeDraftPhoto(i);
    },
    [removeDraftPhoto]
  );

  const setCover = useCallback(
    (i: number) => {
      setDraftCover(i);
    },
    [setDraftCover]
  );

  const publish = useCallback(() => {
    const listing = publishDraft(); // 内部已 canPublish 把关，不满足返回 null
    if (!listing) return null; // 校验不过：保留草稿，让用户补拍
    clearDraft();
    return listing;
  }, [publishDraft, clearDraft]);

  return {
    draft,
    progress: photoProgress(draft),
    canAdd: canAddPhoto(draft),
    canSubmit: canPublish(draft),
    maxPhotos: MAX_PHOTOS,
    requiredPhotos: HARD_PHOTO_MIN,
    update,
    addPhoto,
    removePhoto,
    setCover,
    publish,
  };
}

export default useCreateListing;
