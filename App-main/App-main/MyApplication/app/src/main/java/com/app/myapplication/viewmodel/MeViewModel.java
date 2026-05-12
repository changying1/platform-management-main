package com.app.myapplication.viewmodel;


import androidx.lifecycle.LiveData;
import androidx.lifecycle.MutableLiveData;
import androidx.lifecycle.ViewModel;

import com.app.myapplication.data.model.UserProfile;

public class MeViewModel extends ViewModel {

    private final MutableLiveData<UserProfile> profile = new MutableLiveData<>();

    public MeViewModel() {
        // 这里先写死，后面你可以改成从本地/网络取
        profile.setValue(new UserProfile("小明", ""));
    }

    public LiveData<UserProfile> getProfile() {
        return profile;
    }

    // 以后你想更新昵称/头像，调用这个
    public void updateProfile(UserProfile newProfile) {
        profile.setValue(newProfile);
    }
}
