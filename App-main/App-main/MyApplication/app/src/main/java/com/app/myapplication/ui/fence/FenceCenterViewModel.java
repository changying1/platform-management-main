package com.app.myapplication.ui.fence;

import android.app.Application;

import androidx.annotation.NonNull;
import androidx.lifecycle.AndroidViewModel;
import androidx.lifecycle.LiveData;
import androidx.lifecycle.MutableLiveData;

import com.app.myapplication.data.model.FenceItem;
import com.app.myapplication.data.model.ProjectRegion;
import com.app.myapplication.data.repo.FenceRepository;
import com.app.myapplication.data.model.SimpleStatusResponse;

import java.util.Collections;
import java.util.List;

public class FenceCenterViewModel extends AndroidViewModel {

    private final FenceRepository repo;

    private final MutableLiveData<List<FenceItem>> fences = new MutableLiveData<>(Collections.emptyList());
    private final MutableLiveData<List<ProjectRegion>> regions = new MutableLiveData<>(Collections.emptyList());
    private final MutableLiveData<String> error = new MutableLiveData<>();

    public FenceCenterViewModel(@NonNull Application app) {
        super(app);
        repo = new FenceRepository(app.getApplicationContext());
    }

    public LiveData<List<FenceItem>> fences() { return fences; }
    public LiveData<List<ProjectRegion>> regions() { return regions; }
    public LiveData<String> error() { return error; }

    public void refreshAll() {
        repo.loadFences(new FenceRepository.DataCallback<List<FenceItem>>() {
            @Override public void onSuccess(List<FenceItem> data) { fences.postValue(data); }
            @Override public void onError(String msg) { error.postValue(msg); }
        });

        repo.loadRegions(new FenceRepository.DataCallback<List<ProjectRegion>>() {
            @Override public void onSuccess(List<ProjectRegion> data) { regions.postValue(data); }
            @Override public void onError(String msg) { error.postValue(msg); }
        });
    }

    public void createFence(FenceItem fence) {
        repo.createFence(fence, new FenceRepository.DataCallback<FenceItem>() {
            @Override public void onSuccess(FenceItem data) { refreshAll(); }
            @Override public void onError(String msg) { error.postValue(msg); }
        });
    }

    public void deleteFence(int fenceId) {
        repo.deleteFence(fenceId, new FenceRepository.DataCallback<SimpleStatusResponse>() {
            @Override public void onSuccess(SimpleStatusResponse ok) { refreshAll(); }
            @Override public void onError(String msg) { error.postValue(msg); }
        });
    }
}
