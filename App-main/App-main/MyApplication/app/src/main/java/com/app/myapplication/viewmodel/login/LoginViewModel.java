package com.app.myapplication.viewmodel.login;

import android.app.Application;

import androidx.annotation.NonNull;
import androidx.lifecycle.AndroidViewModel;
import androidx.lifecycle.LiveData;
import androidx.lifecycle.MutableLiveData;

import com.app.myapplication.data.model.LoginResult;
import com.app.myapplication.data.repo.AuthRepository;

/*
    管理登录状态
 */
public class LoginViewModel extends AndroidViewModel {

    public static class UiState {
        public boolean loading;
        public boolean success;
        public String error;
    }

    private final MutableLiveData<UiState> uiState = new MutableLiveData<>(new UiState());
    private final AuthRepository repo;

    public LoginViewModel(@NonNull Application application) {
        super(application);
        repo = new AuthRepository(application);
    }

    public LiveData<UiState> getUiState() {
        return uiState;
    }

    public boolean isLoggedIn() {
        return repo.isLoggedIn();
    }

    // 暂时免密登录：后面你把 repo.loginNoPassword() 换成真实接口即可
    public void loginNoPassword(String username) {
        UiState s = new UiState();
        s.loading = true;
        uiState.setValue(s);

        repo.loginNoPassword(username, new AuthRepository.Callback() {
            @Override
            public void onSuccess(LoginResult result) {
                UiState ok = new UiState();
                ok.success = true;
                uiState.postValue(ok);
            }

            @Override
            public void onError(String msg) {
                UiState fail = new UiState();
                fail.error = msg;
                uiState.postValue(fail);
            }
        });
    }
}

