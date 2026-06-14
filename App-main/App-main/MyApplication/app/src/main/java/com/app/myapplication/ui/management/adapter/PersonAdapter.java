package com.app.myapplication.ui.management.adapter;

import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.PopupMenu;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import com.app.myapplication.R;
import com.app.myapplication.data.model.Person;

import java.util.List;

/**
 * 人员列表适配器
 */
public class PersonAdapter extends RecyclerView.Adapter<PersonAdapter.ViewHolder> {

    private List<Person> persons;
    private boolean canEdit;
    private boolean canDelete;

    public PersonAdapter(List<Person> persons, boolean canEdit, boolean canDelete) {
        this.persons = persons;
        this.canEdit = canEdit;
        this.canDelete = canDelete;
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_person, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        Person person = persons.get(position);
        holder.bind(person);
    }

    @Override
    public int getItemCount() {
        return persons.size();
    }

    class ViewHolder extends RecyclerView.ViewHolder {
        private final ImageView ivAvatar;
        private final TextView tvName;
        private final TextView tvEmployeeId;
        private final TextView tvWorkType;
        private final TextView tvWorkTeam;
        private final TextView tvPhone;
        private final TextView tvStatus;
        private final ImageView ivMore;

        public ViewHolder(@NonNull View itemView) {
            super(itemView);
            ivAvatar = itemView.findViewById(R.id.iv_avatar);
            tvName = itemView.findViewById(R.id.tv_name);
            tvEmployeeId = itemView.findViewById(R.id.tv_employee_id);
            tvWorkType = itemView.findViewById(R.id.tv_work_type);
            tvWorkTeam = itemView.findViewById(R.id.tv_work_team);
            tvPhone = itemView.findViewById(R.id.tv_phone);
            tvStatus = itemView.findViewById(R.id.tv_status);
            ivMore = itemView.findViewById(R.id.iv_more);
        }

        public void bind(Person person) {
            tvName.setText(person.getName());
            tvEmployeeId.setText("工号: " + person.getEmployeeId());
            tvWorkType.setText(person.getWorkType());
            tvWorkTeam.setText(person.getWorkTeam());
            tvPhone.setText(person.getPhone());
            tvStatus.setText(person.getStatusText());
            tvStatus.setTextColor(person.getStatusColor());
            
            // 更多操作
            ivMore.setOnClickListener(v -> {
                PopupMenu popup = new PopupMenu(itemView.getContext(), ivMore);
                popup.getMenuInflater().inflate(R.menu.menu_person_item, popup.getMenu());
                
                // 根据权限显示/隐藏菜单项
                if (!canEdit) {
                    popup.getMenu().findItem(R.id.action_edit).setVisible(false);
                }
                if (!canDelete) {
                    popup.getMenu().findItem(R.id.action_delete).setVisible(false);
                }
                
                popup.show();
            });
        }
    }
}
